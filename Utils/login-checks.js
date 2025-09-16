const loginChecks = (user) => {
  // console.log("ROLE:", currentrole, "USER:", user);
  if (!user.verified) {
    return "email-unverified";
  } else if (
    !user.dob ||
    !user.gender ||
    user.dob === undefined ||
    user.gender === undefined ||
    user.dob === null ||
    user.gender === null
  ) {
    return "account-setup-pending";
  } else {
    return "login-granted";
  }
};

module.exports = {
  loginChecks,
};
