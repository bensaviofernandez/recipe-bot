require('dotenv').config();
const restify = require('restify');
const path = require('path');

const { ComputerVisionClient } = require('@azure/cognitiveservices-computervision');
const { ApiKeyCredentials } = require('@azure/ms-rest-js');
const { OpenAIClient } = require('@azure/openai');
const { AzureKeyCredential } = require('@azure/core-auth');
const { CosmosClient } = require('@azure/cosmos');

const INGREDIENT_WHITELIST = [
  'tomato', 'onion', 'carrot', 'broccoli', 'egg',
  'chicken', 'mushroom', 'pepper', 'garlic', 'cheese'
];

async function initAzure() {
  console.log('Configuring Azure clients…');

  const cvClient = new ComputerVisionClient(
    new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_CV_KEY } }),
    process.env.AZURE_CV_ENDPOINT
  );
  console.log('✔️ Computer Vision client ready');

  const openaiClient = new OpenAIClient(
    process.env.AZURE_OPENAI_ENDPOINT,
    new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
  );
  console.log('✔️ OpenAI client ready');

  const cosmos = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY
  });
  console.log('✔️ Cosmos client ready');

  const dbId = 'recipebot-db';
  const containerId = 'recipe-DB';

  const { database } = await cosmos.databases.createIfNotExists({ id: dbId });
  console.log(`Database OK: ${database.id}`);
  const { container } = await database.containers.createIfNotExists({
    id: containerId,
    partitionKey: { kind: 'Hash', paths: ['/id'] }
  });
  console.log(`Container OK: ${container.id}`);

  return { cvClient, openaiClient, cosmosContainer: container };
}

(async function main() {
  const { cvClient, openaiClient, cosmosContainer } = await initAzure();
  const deploymentName = process.env.OPENAI_DEPLOYMENT_NAME || 'gpt-35-turbo';
  console.log(`Using OpenAI deployment: ${deploymentName}\n`);

  const server = restify.createServer({ name: 'recipe-bot' });
  server.use(restify.plugins.bodyParser());

  // serve UI
  server.get('/', restify.plugins.serveStatic({ directory: __dirname, file: 'index.html' }));
  server.get('/images/*', restify.plugins.serveStatic({
    directory: path.join(__dirname, 'images')
  }));

  // IMAGE-BASED RECOMMENDATION
  server.post('/recommend', async (req, res) => {
    console.log('[POST] /recommend', req.body);
    const { imageUrl } = req.body;
    if (!imageUrl) return res.send(400, { error: 'Missing imageUrl.' });

    try {
      // 1) tags + objects
      console.log('→ analyzing image (tags + objects)');
      const [tagRes, objRes] = await Promise.all([
        cvClient.analyzeImage(imageUrl, { visualFeatures: ['Tags'] }),
        cvClient.detectObjects(imageUrl)
      ]);

      const rawTags = tagRes.tags.map(t => t.name.toLowerCase());
      const rawObjs = objRes.objects.map(o => o.object.toLowerCase());
      let candidates = Array.from(new Set([...rawTags, ...rawObjs]));

      // 2) filter by whitelist
      let detected = candidates.filter(x => INGREDIENT_WHITELIST.includes(x));
      console.log('→ detected (tags/objects):', detected);

      // 3) fallback to captions if needed
      if (detected.length === 0) {
        console.log('→ no tags/objects, falling back to captions');
        const captionRes = await cvClient.describeImage(imageUrl, { maxCandidates: 3 });
        const captions = captionRes.captions.map(c => c.text.toLowerCase());
        console.log('→ captions:', captions);

        // split captions into words and filter
        const words = captions.join(' ').split(/\W+/);
        detected = Array.from(new Set(words))
          .filter(w => INGREDIENT_WHITELIST.includes(w));
        console.log('→ detected (captions):', detected);
      }

      if (!detected.length) {
        return res.send({
          detected,
          suggestions: [],
          recommendation: 'No recognizable ingredients detected.'
        });
      }

      // 4) load all recipes
      console.log('→ loading recipes');
      const { resources: allRecipes } = await cosmosContainer.items.readAll().fetchAll();
      console.log(`→ ${allRecipes.length} recipes total`);

      // 5) match up to 2 ingredients
      let matched = [];
      detected.slice(0, 2).forEach(tag => {
        const hits = allRecipes.filter(r =>
          r.difficulty === 'easy' &&
          Array.isArray(r.ingredients) &&
          r.ingredients.includes(tag)
        );
        console.log(` • ${hits.length} hits for "${tag}"`);
        matched.push(...hits);
      });

      // 6) dedupe & pick top 3
      const suggestions = Array.from(
        new Map(matched.map(r => [r.id, r])).values()
      ).slice(0, 3);
      console.log('→ suggestions:', suggestions.map(r => r.name));

      // 7) prompt OpenAI
      const listText = suggestions
        .map(r => `- ${r.name} (${r.cook_time} min)`)
        .join('\n');
      const prompt = `
Ingredients: ${detected.join(', ')}
Easy recipes:
${listText}
Describe each in one sentence.
`;
      console.log('→ prompt:', prompt.trim());

      const ai = await openaiClient.getChatCompletions(deploymentName, [
        { role: 'system', content: 'You are a helpful cooking assistant.' },
        { role: 'user', content: prompt }
      ]);
      const recommendation = ai.choices[0].message.content.trim();
      console.log('→ LLM recommendation:\n', recommendation);

      res.send({ detected, suggestions, recommendation });

    } catch (err) {
      console.error('❌ /recommend error:', err);
      res.send(500, { error: err.message });
    }
  });

  // TEXT-BASED RECOMMENDATION (unchanged)
  server.post('/recommend-text', async (req, res) => {
    console.log('[POST] /recommend-text', req.body);
    const { ingredients } = req.body;
    if (!Array.isArray(ingredients) || !ingredients.length) {
      return res.send(400, { error: 'Provide an ingredients array.' });
    }
    try {
      console.log('→ loading recipes');
      const { resources: allRecipes } = await cosmosContainer.items.readAll().fetchAll();
      console.log(`→ ${allRecipes.length} recipes total`);

      let matched = [];
      ingredients.slice(0, 2).forEach(tag => {
        const hits = allRecipes.filter(r =>
          r.difficulty === 'easy' &&
          Array.isArray(r.ingredients) &&
          r.ingredients.includes(tag)
        );
        console.log(` • ${hits.length} hits for "${tag}"`);
        matched.push(...hits);
      });

      const suggestions = Array.from(
        new Map(matched.map(r => [r.id, r])).values()
      ).slice(0, 3);
      console.log('→ suggestions:', suggestions.map(r => r.name));

      const listText = suggestions
        .map(r => `- ${r.name} (${r.cook_time} min)`)
        .join('\n');
      const prompt = `
Ingredients: ${ingredients.join(', ')}
Easy recipes:
${listText}
Describe each in one sentence.
`;
      console.log('→ prompt:', prompt.trim());

      const ai = await openaiClient.getChatCompletions(deploymentName, [
        { role: 'system', content: 'You are a helpful cooking assistant.' },
        { role: 'user', content: prompt }
      ]);
      const recommendation = ai.choices[0].message.content.trim();
      console.log('→ LLM recommendation:\n', recommendation);

      res.send({ ingredients, suggestions, recommendation });

    } catch (err) {
      console.error('❌ /recommend-text error:', err);
      res.send(500, { error: err.message });
    }
  });

  const port = process.env.PORT || 3978;
  server.listen(port, () => console.log(`Server listening at http://localhost:${port}`));
})();
