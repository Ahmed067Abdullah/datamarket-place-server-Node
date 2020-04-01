const express = require("express");
const iotaController = require("../controllers/iota");
const DelayedResponse = require('http-delayed-response');

const router = express.Router();

router.use(function (req, res) {
    var delayed = new DelayedResponse(req, res);
    iotaController.purchaseStream(delayed.wait());
    console.log('here');
});

router.get("/", iotaController.get);

router.post("/purchaseStream", iotaController.purchaseStream);


module.exports = router;
