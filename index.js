require('dotenv').config();
const restify = require('restify');

// Azure SDK imports
const { ComputerVisionClient } = require('@azure/cognitiveservices-computervision');
const { ApiKeyCredentials } = require('@azure/ms-rest-js');
const { OpenAIClient } = require('@azure/openai');
const { AzureKeyCredential } = require('@azure/core-auth');
const { CosmosClient } = require('@azure/cosmos');

// Ingredient whitelist for filtering CV tags
const INGREDIENT_WHITELIST = [
  'tomato', 'onion', 'carrot', 'broccoli', 'egg',
  'chicken', 'mushroom', 'pepper', 'garlic'
];

// 1) Create and configure Azure clients
console.log('Configuring Azure clients...');
const cvClient = new ComputerVisionClient(
  new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_CV_KEY }}),
  process.env.AZURE_CV_ENDPOINT
);
console.log('Computer Vision client configured.');

const openaiClient = new OpenAIClient(
  process.env.AZURE_OPENAI_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
);
console.log('OpenAI client configured.');

const cosmosClient = new CosmosClient({
  endpoint: process.env.COSMOS_DB_ENDPOINT,
  key: process.env.COSMOS_DB_KEY
});
const cosmosContainer = cosmosClient.database('RecipeDB').container('Recipes');
console.log('Cosmos DB client configured.');

// OpenAI deployment name
const deploymentName = process.env.OPENAI_DEPLOYMENT_NAME || 'gpt-35-turbo';
console.log(`Using OpenAI deployment: ${deploymentName}`);

// 2) Create the server
console.log('Starting server setup...');
const server = restify.createServer({ name: 'recipe-bot' });
// 3) Parse JSON bodies
server.use(restify.plugins.bodyParser());

// 4) Health-check endpoint
server.get('/', async (req, res) => {
  console.log('Received GET /');
  res.send({ message: 'Hello from Recipe Bot!' });
});

// 5) Recommendation endpoint
server.post('/recommend', async (req, res) => {
  console.log('Received POST /recommend');
  try {
    const { imageUrl } = req.body;
    console.log('Request body:', req.body);
    if (!imageUrl) {
      console.error('No imageUrl provided');
      return res.send(400, { error: 'Please include imageUrl in body.' });
    }

    // 5.1) Analyze image for tags
    console.log(`Calling Computer Vision for URL: ${imageUrl}`);
    const cvResult = await cvClient.analyzeImage(imageUrl, { visualFeatures: ['Tags'] });
    const detectedRaw = cvResult.tags.map(t => t.name.toLowerCase());
    console.log('Detected raw tags:', detectedRaw);

    // Filter tags to only ingredients
    const detected = detectedRaw.filter(tag => INGREDIENT_WHITELIST.includes(tag));
    console.log('Filtered ingredient tags:', detected);

    if (detected.length === 0) {
      console.warn('No trusted ingredients detected');
      return res.send(200, { detected: [], suggestions: [], recommendation: 'No recognizable ingredients detected. Please try another image.' });
    }

    // 5.2) Query Cosmos DB for recipes matching detected ingredients
    console.log('Querying Cosmos DB for matching recipes...');
    const easyRecipes = [];
    const topTags = detected.slice(0, 2);
    console.log('Top tags for search:', topTags);
    for (let tag of topTags) {
      const querySpec = {
        query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(c.ingredients, @tag) AND c.difficulty = @difficulty',
        parameters: [
          { name: '@tag', value: tag },
          { name: '@difficulty', value: 'easy' }
        ]
      };
      console.log(`Executing query for tag: ${tag}`);
      const { resources: results } = await cosmosContainer.items.query(querySpec).fetchAll();
      console.log(`Found ${results.length} recipes for tag "${tag}"`);
      easyRecipes.push(...results);
    }
    // Deduplicate and pick top 3
    const uniqueMap = new Map(easyRecipes.map(r => [r.id, r]));
    const suggestions = Array.from(uniqueMap.values()).slice(0, 3);
    console.log('Final suggestions:', suggestions.map(r => r.name));

    // 5.3) Build prompt for OpenAI
    const recipeListText = suggestions.map(r => `- ${r.name} (${r.cook_time} min)`).join('\n');
    const prompt = `The user has ingredients: ${detected.join(', ')}. \"Easy\" recipes available:\n${recipeListText}\nPlease suggest up to 3 of these recipes with a one-sentence description each.`;
    console.log('Constructed prompt:', prompt);

    // Send to OpenAI
    console.log('Sending to OpenAI...');
    const aiResult = await openaiClient.getChatCompletions(deploymentName, [
      { role: 'system', content: 'You are a helpful cooking assistant.' },
      { role: 'user', content: prompt }
    ]);
    const recommendation = aiResult.choices[0].message.content.trim();
    console.log('OpenAI recommendation:', recommendation);

    // 5.4) Send final response
    res.send({ detected, suggestions, recommendation });

  } catch (err) {
    console.error('Error in /recommend:', err);
    res.send(500, { error: err.message || 'Something went wrong.' });
  }
});

// 6) Start listening
const port = process.env.PORT || 3978;
server.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
