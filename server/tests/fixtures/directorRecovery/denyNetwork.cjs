const deny = () => {
  const error = new Error("Network access is disabled in director recovery fixtures.");
  error.code = "DIRECTOR_RECOVERY_NETWORK_DISABLED";
  throw error;
};

global.fetch = deny;
for (const protocol of ["node:http", "node:https"]) {
  const transport = require(protocol);
  transport.request = deny;
  transport.get = deny;
}
const net = require("node:net");
net.connect = deny;
net.createConnection = deny;
net.Socket.prototype.connect = deny;
