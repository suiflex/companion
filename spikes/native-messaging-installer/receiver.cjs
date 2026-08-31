#!/usr/bin/env node
// Local receiver: the extension POSTs its native-messaging results here.
'use strict';
const http = require('http');
const fs = require('fs');
const OUT = '/tmp/meetcc-spike-receiver.json';

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { fs.writeFileSync(OUT, body); console.log('report received', body.slice(0, 120)); }
      catch (e) { console.error('write failed', e); }
      res.writeHead(204); res.end();
    });
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(17777, '127.0.0.1', () => console.log('receiver on 127.0.0.1:17777'));
