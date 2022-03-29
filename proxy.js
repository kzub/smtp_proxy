const net = require('net');
const config = require('./config');

// --------------------------------------------------------
function getAdress (conn) {
  return `${conn.remoteAddress}:${conn.remotePort}`;
}

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
      conn.write(d);
      // console.log(`SMTP_Proxy >>> ${line.slice(0, -1)}`); // slice -1 to remove \n
    });

    mailServer.on('close', () => {
      try {
        conn.end();
      } catch(err) {
        console.log(`MAILSRV --- ${getAdress(conn)} already closed`);
      }
    });

    mailServer.on('error', (err) => {
      console.log(`MAILSRV --- ERROR ${getAdress(conn)}: ${err}`);
    });
  });

  conn.on('data', d => {
    let lines = d.toString();
    console.log(`SMTP_Proxy <<< ${lines.slice(0, -1)}`); // slice -1 to remove \n
    lines = lines.replace(recepientRegExp, config.proxyToEmail);
    mailServer.write(lines);
    console.log(`MAILSRV >>> ${lines.slice(0, -1)}`); // slice -1 to remove \n
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function isSMTPcmd (cmd, lines) {
  return lines.split(/\r\n/).filter(str => str.toLowerCase() == cmd).length > 0;
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
function skipMail (conn) {
  connWrite(conn, `220 ${config.proxyToDomain} SMTP OTT`);
  conn.on('data', d => {
    let lines = d.toString();
    console.log(`SMTP_Proxy <<< ${lines.slice(0, -1)}`); // slice -1 to remove \n

    if (isSMTPcmd('data', lines)) {
      connWrite(conn, '354 ready');
    }
    else if (isSMTPcmd('quit', lines)) {
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
