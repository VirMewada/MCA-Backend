const otpNumber = (numDigits = 6) => {
  if (numDigits && numDigits < 1) {
    throw new Error("Number of digits must be at least 1.");
  }
  const min = Math.pow(10, numDigits - 1);
  const max = Math.pow(10, numDigits) - 1;
  return Math.floor(min + Math.random() * (max - min + 1));
};

module.exports = {
  otpNumber,
};
