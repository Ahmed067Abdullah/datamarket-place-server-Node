const express = require('express');
const bodyParser = require('body-parser');
const iota = require('./routes/iota');

const app = express();
const port = 5000;

app.use(bodyParser.json());

app.use('/api/iota',iota);

app.listen(port, () => {
    console.log(`server started on port ${port}`)
});