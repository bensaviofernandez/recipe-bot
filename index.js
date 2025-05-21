require('dotenv').config();
const restify = require('restify');

// 1) Create the server
const server = restify.createServer({
  name: 'recipe-bot',
});

// 2) Parse JSON bodies
server.use(restify.plugins.bodyParser());

// 3) A simple test endpoint
server.get('/', async (req, res) => {
  res.send({ message: 'Hello from Recipe Bot!' });
});


// 4) Start listening
const port = process.env.PORT || 3978;
server.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
