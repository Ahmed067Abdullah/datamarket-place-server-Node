const express = require("express");
const iotaController = require("../controllers/iota");
const DelayedResponse = require('http-delayed-response');

const router = express.Router();

router.use(function (req, res) {
    var delayed = new DelayedResponse(req, res);

    var promise = iotaController.purchaseStream();
    // will eventually end when the promise is fulfilled
    delayed.end(promise);
});

router.get("/", iotaController.get);

router.post("/purchaseStream", iotaController.purchaseStream);


module.exports = router;
