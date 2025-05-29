const nodemailer = require('nodemailer');

// Create transporter with more detailed configuration
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('Email configuration is missing. Please set EMAIL_USER and EMAIL_PASS in .env file');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    debug: true, // Enable debug logs
    logger: true  // Enable logger
  });
};

const sendPasswordResetEmail = async (email, resetToken) => {
  console.log('Attempting to send password reset email to:', email);
  
  try {
    const transporter = createTransporter();
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    console.log('Created email transporter with config:', {
      user: process.env.EMAIL_USER,
      frontendUrl: process.env.FRONTEND_URL
    });

    const mailOptions = {
      from: `"Excel Analytics" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset Request</h1>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <a href="${resetUrl}" style="display: inline-block; background: #f02e65; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Note: This link will only work once and will expire after 1 hour for security reasons.</p>
      `
    };

    console.log('Sending email with options:', {
      to: email,
      subject: mailOptions.subject
    });

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Detailed email error:', {
      error: error.message,
      code: error.code,
      command: error.command,
      stack: error.stack
    });
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
};

module.exports = {
  sendPasswordResetEmail
}; 