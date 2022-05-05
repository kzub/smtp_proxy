const net = require('net');
const config = require('./config');

const recepientRegExp = new RegExp(config.proxyEmail, 'ig');
const removeNLRegExp = new RegExp(/\r\n/, 'g');

function mylog(a,b='',c='',d='') {
  const date = new Date().toJSON().slice(0,19);
  console.log(date, a, b, c, d);
}

// --------------------------------------------------------
function getAdress (conn) {
  return `${conn.remoteAddress}:${conn.remotePort}`;
}

function removeNewLines(line) {
  return line.replace(removeNLRegExp, '');
}

function formatLine(line) {
  if (!line) {
    return line;
  }
  if (line.length < 80) {
    return `(${line.length}) [${removeNewLines(line)}]`;
  }
  return `(${line.length}) [${removeNewLines(line.slice(0, 30))} ... ${removeNewLines(line.slice(-30))}]`
}

// --------------------------------------------------------
function isSMTPcmd (cmd, line) {
  return line.split(/\r\n/).filter(str => str.toLowerCase().indexOf(cmd) == 0).length > 0;
}


// --------------------------------------------------------
function addDefaultConnectionHandlers (conn) {
  conn.on('error', err => {
    mylog(`SMTP_Proxy === ERROR ${getAdress(conn)}:`, err);
    conn.end();
  });

  conn.on('close', () => {
    mylog(`SMTP_Proxy === client ${getAdress(conn)}: closed`);
  });

  conn.on('timeout', () => {
    mylog(`SMTP_Proxy === client ${getAdress(conn)}: timeouted`);
  });
}

// --------------------------------------------------------
function forwardMail (conn) {
  mylog(`SMTP_Proxy >>> ${getAdress(conn)}: connecting to ${config.mailServerHost}:${config.mailServerPort}`);

  const mailServer = net.createConnection(config.mailServerPort, config.mailServerHost, () => {
    mailServer.on('data', d => {
      const line = d.toString();
      mylog(`MAILSRV >>> ${getAdress(conn)}: ${formatLine(line)}`);
      if(conn.readyState === "open") {
        conn.write(d); // обычно это в конце общения происходит. "250 ок" и "221 bye" сразу
      }
    });

    mailServer.on('close', () => {
      mylog(`MAILSRV >>> connection close [1] ${getAdress(conn)}`);
      setTimeout(function(){
        mylog(`MAILSRV >>> connection close [2] ${getAdress(conn)}`);
        conn.end();
      }, 1000);
    });

    mailServer.on('error', (err) => {
      mylog(`MAILSRV === ERROR ${getAdress(conn)}:`, err);
      conn.end();
      mailServer.end();
    });
  });

  conn.on('data', d => {
    let line = d.toString();
    mylog(`SMTP_Proxy <<< ${getAdress(conn)}: ${formatLine(line)}`);
    if (isSMTPcmd('starttls', line)) {
      mylog(`SMTP_Proxy >>> ${getAdress(conn)}: TLS not supported`);
      conn.write('454 TLS not available due to temporary reason\r\n');
      return;
    }
    let newline = line.replace(recepientRegExp, config.proxyToEmail);
    if (newline !== line) {
      mylog(`MAILSRV <<< (...) ${getAdress(conn)}: replaced length: ${line.length}`);
      mailServer.write(line);
    } else {
      mylog(`MAILSRV <<< (...) ${getAdress(conn)}: no replace`);
      mailServer.write(d);
    }
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function skipMail (conn) {
  conn.write(`220 ${config.proxyToDomain} SMTP OTT\r\n`);
  let dataStarted = false;

  conn.on('data', d => {
    let line = d.toString();
    mylog(`SMTP_Proxy <<< ${getAdress(conn)}: ${formatLine(line)}`);

    if (isSMTPcmd('data', line)) {
      conn.write('354 ready\r\n');
      dataStarted = true;
    }
    else if (isSMTPcmd('starttls', line)) {
      mylog(`SMTP_Proxy >>> ${getAdress(conn)}: TLS not supported`);
      conn.write('454 TLS not available due to temporary reason\r\n');
      return;
    }
    else if (isSMTPcmd('quit', line)) {
      mylog(`SMTP_Proxy >>> ${getAdress(conn)}: connection end`);
      conn.end('221 Bye\r\n');
    }
    else if (line == '.\r\n'){
      conn.write('250 ok\r\n');
      dataStarted = false;
    }
    else if(!dataStarted) {
      conn.write('250 ok\r\n');
    }
    else {
      // data is going...
      // do nothing
    }
  });

  addDefaultConnectionHandlers(conn);
}

// --------------------------------------------------------
function chooseForwarding (conn) {
  if (Math.random() <= (config.forwardingPercent/100)) {
    mylog(`SMTP_Proxy === FORWARD: client ${getAdress(conn)}`);
    return forwardMail(conn);
  }
  mylog(`SMTP_Proxy === SKIP: client ${getAdress(conn)}`);
  return skipMail(conn);
}


// --------------------------------------------------------
const server = net.createServer(chooseForwarding);

server.on('error', (err) => {
  mylog('SMTP_Proxy --- ERROR:', err);
});

server.listen(config.smtpPort, config.smtpHost, () => {
  mylog(`SMTP_Proxy --- server bound to ${config.smtpHost}:${config.smtpPort}`);
});
