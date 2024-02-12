var fs = require('fs');
var http = require('http');
var https = require('https');
var privateKey  = fs.readFileSync('/etc/letsencrypt/live/table.carroted.org/privkey.pem', 'utf8');
var certificate = fs.readFileSync('/etc/letsencrypt/live/table.carroted.org/fullchain.pem', 'utf8');

var credentials = {key: privateKey, cert: certificate};
var express = require('express');
var app = express();

// static the dist/ folder
app.use(express.static('dist'));

// your express configuration here

var httpServer = http.createServer(app);
var httpsServer = https.createServer(credentials, app);

httpServer.listen(80);
httpsServer.listen(443);

console.log('we are Listening to you.');