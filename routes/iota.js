const express = require("express");
const iotaController = require( "../controllers/iota");

const router = express.Router();

router.get("/", iotaController.get);

router.post("/purchaseStream", iotaController.purchaseStream);

module.exports = router;
