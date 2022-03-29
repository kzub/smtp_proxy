const net = require('net');
const config = require('./config');

// --------------------------------------------------------
function getAdress (conn) {
  return `${conn.remoteAddress}:${conn.remotePort}`;
}

// --------------------------------------------------------
function addDefaultConnectionHandlers (conn) {
  conn.on('error', err => {
    console.log(`SMTP_Proxy === ERROR ${getAdress(conn)}:`, err);
  });

  conn.on('close', () => {
    // console.log(`SMTP_Proxy === client ${getAdress(conn)} closed`);
  });

  conn.on('timeout', () => {
    console.log(`SMTP_Proxy === client ${getAdress(conn)} timeouted`);
  });
}

const recepientRegExp = new RegExp(config.proxyEmail, 'ig');

// --------------------------------------------------------
function forwardMail (conn) {
  // console.log(`SMTP_Proxy === connecting to ${config.mailServerHost}:${config.mailServerPort}`);
  const mailServer = net.createConnection(config.mailServerPort, config.mailServerHost, () => {
    mailServer.on('data', d => {
      // let line = d.toString();
      // console.log(`MAILSRV <<< ${line.slice(0, -1)}`); // slice -1 to remove \n
      conn.write(d);
      // console.log(`SMTP_Proxy >>> ${line.slice(0, -1)}`); // slice -1 to remove \n
    });

    mailServer.on('close', () => {
      try {
        conn.end();
      } catch(err) {
        console.log(`MAILSRV === ${getAdress(conn)} already closed`);
      }
    });

    mailServer.on('error', (err) => {
      console.log(`MAILSRV === ERROR ${getAdress(conn)}:`, err);
    });
  });

  conn.on('data', d => {
    let lines = d.toString();
    // console.log(`SMTP_Proxy <<< ${lines.slice(0, -1)}`); // slice -1 to remove \n
    lines = lines.replace(recepientRegExp, config.proxyToEmail);
    mailServer.write(lines);
    // console.log(`MAILSRV >>> ${lines.slice(0, -1)}`); // slice -1 to remove \n
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function isSMTPcmd (cmd, lines) {
  return lines.split(/\r\n/).filter(str => str.toLowerCase().indexOf(cmd) == 0).length > 0;
}

// --------------------------------------------------------
function skipMail (conn) {
  conn.write(`220 ${config.proxyToDomain} SMTP OTT\r\n`);
  conn.on('data', d => {
    let lines = d.toString();
    console.log(`SMTP_Proxy <<< ${lines}`);

    if (isSMTPcmd('data', lines)) {
      conn.write('354 ready\r\n');
    }
    else if (isSMTPcmd('quit', lines)) {
      conn.end();
    }
    else {
      conn.write('250 ok\r\n');
    }
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function chooseForwarding (conn) {
  if (Math.random() <= (config.forwardingPercent/100)) {
    console.log(`SMTP_Proxy === FORWARD: client ${getAdress(conn)}`);
    return forwardMail(conn);
  }
  console.log(`SMTP_Proxy === SKIP: client ${getAdress(conn)}`);
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
