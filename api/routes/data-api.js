var express = require('express');
var router = express.Router();

/** DATA API
 * // this file utilizes an express router in node.js to transfer the xml data to the frontend
 * 
 * node fs : built-in module for reading local files
 * xml2js parser : node package for converting xml to json (https://www.npmjs.com/package/xml2js)
 *               **(JSON is naturally more compatible with Javascript frameworks like Angular)
*/


// define fs and xml2js
const fs = require('fs');
var parser = require('xml2js');

// read in xml file
fs.readFile('./status.xml', 'utf8', function(err, data) {
  if (err) {
    return console.log(err);
  }
  //parse data from file
  parser.parseString(data, function(err, result) {

    //route json result via express api, http://localhost:9000/data-api
    router.get('/', function(req, res, next) {
      res.send(JSON.stringify(result) );
      //res.send(' TEST: API is working properly');
    });

  });
});

module.exports = router;