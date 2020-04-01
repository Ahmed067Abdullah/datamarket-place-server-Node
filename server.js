const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors')
const iota = require('./routes/iota');

const app = express();
const port = 5000;

app.use(bodyParser.json());

app.use(cors());

app.use('/api/iota', iota);

app.get('/', (req, res) => {
    res.json({ msg: 'hoho' });
});

app.listen(port, () => {
    console.log(`server started on port ${port}`)
});