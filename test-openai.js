require('dotenv').config();
const { OpenAIClient } = require('@azure/openai');
const { AzureKeyCredential } = require('@azure/core-auth');    // ← note this


const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
const key      = process.env.AZURE_OPENAI_KEY;
const client   = new OpenAIClient(endpoint, new AzureKeyCredential(key));


async function testOpenAI() {
  // Use the deployment name from the portal
  const deploymentName = 'gpt-35-turbo';

  const chat = [
    { role: 'system', content: 'You are a helpful cooking assistant.' },
    {
      role: 'user',
      content:
        'Recommend an easy recipe I can make with tomatoes and garlic.',
    },
  ];

  const result = await client.getChatCompletions(deploymentName, chat);
  console.log('Assistant:', result.choices[0].message.content.trim());
}

testOpenAI().catch((err) => console.error('OpenAI error:', err));
