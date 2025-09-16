const sendResponse = (status, success, message, size, data, act) => {
  return {
    status,
    success,
    message,
    size,
    data,
    act,
  };
};

module.exports = sendResponse;
