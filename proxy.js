const net = require('net');
const config = require('./config');

// --------------------------------------------------------
function getAdress (conn) {
  return `${conn.remoteAddress}:${conn.remotePort}`;
}

function getSMTPcmd (line) {
  return line.split(/\r\n|\s/).shift().toLowerCase();
}

// --------------------------------------------------------
const connWrite = (conn, txt, end) => {
  console.log(`SMTP_Proxy >>> ${txt}`);
  if (end) {
    conn.end(txt + '\r\n');
  } else {
    conn.write(txt + '\r\n');
  }
};

// --------------------------------------------------------
function addDefaultConnectionHandlers (conn) {
  conn.on('error', err => {
    console.log(`SMTP_Proxy <<< ERROR ${getAdress(conn)}: ${err}`);
  });

  conn.on('close', () => {
    console.log(`SMTP_Proxy --- client ${getAdress(conn)} closed`);
  });

  conn.on('timeout', () => {
    console.log(`SMTP_Proxy --- client ${getAdress(conn)} timeouted`);
  });
}

const recepientRegExp = new RegExp(config.proxyEmail, 'ig');

// --------------------------------------------------------
function forwardMail (conn) {
  console.log(`SMTP_Proxy === connecting to ${config.mailServerHost}:${config.mailServerPort}`); // slice -1 to remove \n
  const mailServer = net.createConnection(config.mailServerPort, config.mailServerHost, () => {
    mailServer.on('data', d => {
      let line = d.toString();
      console.log(`MAILSRV <<< ${line.slice(0, -1)}`); // slice -1 to remove \n
      connWrite(conn, d);
      console.log(`SMTP_Proxy >>> ${line.slice(0, -1)}`); // slice -1 to remove \n
    });

    mailServer.on('close', () => {
      conn.end();
    });
  });

  conn.on('data', d => {
    let lines = d.toString();
    console.log(`SMTP_Proxy <<< ${lines.slice(0, -1)}`); // slice -1 to remove \n
    lines = lines.replace(recepientRegExp, config.proxyToEmail);
    connWrite(mailServer, lines);
    console.log(`MAILSRV >>> ${lines.slice(0, -1)}`); // slice -1 to remove \n
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function skipMail (conn) {
  conn.on('data', d => {
    let line = d.toString();
    console.log(`SMTP_Proxy <<< ${line.slice(0, -1)}`); // slice -1 to remove \n
    let cmd = getSMTPcmd(line);

    if (cmd == 'data') {
      connWrite(conn, '354 ready');
    }
    else if (cmd == 'quit') {
      connWrite(conn, '221 Bye', true);
    }
    else {
      connWrite(conn, '250 ok');
    }
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function chooseForwarding (conn) {
  console.log(`SMTP_Proxy --- client ${getAdress(conn)} connected`);
  connWrite(conn, `220 ${config.proxyToDomain} SMTP OTT`);

  if (Math.random() <= (config.forwardingPercent/100)) {
    return forwardMail(conn);
  }
  return skipMail(conn);
}


// --------------------------------------------------------
const server = net.createServer(chooseForwarding);

server.on('error', (err) => {
  console.log('SMTP_Proxy --- ERROR:', err);
});

server.listen(config.smtpPort, config.smtpHost, () => {
  console.log(`SMTP_Proxy --- server bound to ${config.smtpHost}:${config.smtpPort}`);
});
