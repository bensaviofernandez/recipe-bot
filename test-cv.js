require('dotenv').config();

const { ComputerVisionClient } =
  require('@azure/cognitiveservices-computervision');
const { ApiKeyCredentials } = require('@azure/ms-rest-js');

// Load your key & endpoint from .env
const key = process.env.AZURE_CV_KEY;
const endpoint = process.env.AZURE_CV_ENDPOINT;

// Instantiate the client
const client = new ComputerVisionClient(
  new ApiKeyCredentials({ inHeader: { 'Ocp-Apim-Subscription-Key': key } }),
  endpoint
);

async function testCV() {
  // A public sample image
  const imageUrl =
    'https://raw.githubusercontent.com/Azure-Samples/cognitive-services-sample-data-files/master/ComputerVision/Images/faces.jpg';

  // Analyze for tags
  const result = await client.analyzeImage(imageUrl, {
    visualFeatures: ['Tags'],
  });

  console.log('Detected tags:', result.tags.map(t => t.name).join(', '));
}

testCV().catch(err => console.error('Error:', err));
