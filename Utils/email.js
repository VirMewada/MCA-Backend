const nodemailer = require("nodemailer");
const pug = require("pug");

module.exports = class Email {
  constructor(user, url) {
    this.to = user.email;

    this.firstName = user.name;

    this.url = url;
    this.from = `Prima Pumps <${process.env.EMAILUSER}>`;
  }

  newTransport() {
    // Send Grid
    return nodemailer.createTransport({
      host: "smtpout.secureserver.net",
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAILUSER,
        pass: process.env.EMAILPASS,
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
    await this.send(`Your OTP is: ${a}`, `Email Verification For Prima Pumps`);
  }

  async sendPasswordReset(a) {
    await this.send(
      `Password Reset Code is:${a}`,
      "Your password reset token ! ( valid for 1 minute)"
    );
  }
};
