const nodemailer = require("nodemailer");
const pug = require("pug");

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;

    this.firstName = user.name;

    this.url = url;
    this.from = `orkéstio <${process.env.GMAILUSER}>`;
  }

  newTransport() {
    // Send Grid
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAILUSER,

        pass: process.env.GMAILPASS,
      },
    });
  }
  async send(template, subject) {
    console.log(this.from);

    // 2) Define email options
    const mailOptions = {
      from: this.from,
      to: this.to,
      subject,
      text: template,
    };
    // 3)Creat a transport and send email

    await this.newTransport().sendMail(mailOptions);
  }
  async sendWelcome(a) {
    console.log("sending mail...");
    await this.send(`Your OTP is: ${a}`, `Email Verification For Orkéstio`);
  }

  async sendPasswordReset(a) {
    await this.send(
      `Password Reset Code is:${a}`,
      "Your password reset token ! ( valid for 1 minute)"
    );
  }
};
