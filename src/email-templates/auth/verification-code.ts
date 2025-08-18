interface VerificationCodeEmailProps {
  code: string;
}

export function createVerificationCodeEmail({ code }: VerificationCodeEmailProps): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verifique seu email</title>
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          text-align: center;
          padding: 20px 0;
        }
        .logo {
          max-width: 120px;
        }
        .content {
          background-color: #ffffff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .verification-code {
          font-size: 32px;
          font-weight: bold;
          text-align: center;
          letter-spacing: 4px;
          margin: 30px 0;
          color: #2563eb;
        }
        .footer {
          text-align: center;
          font-size: 12px;
          color: #666;
          margin-top: 30px;
        }
        .button {
          display: inline-block;
          background-color: #2563eb;
          color: white;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          font-weight: 500;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://cxlus.com/logo.png" alt="Cxlus Logo" class="logo">
        </div>
        <div class="content">
          <h1>Verifique seu email</h1>
          <p>Obrigado por se cadastrar na Cxlus. Para continuar com seu cadastro, utilize o código de verificação abaixo:</p>
          
          <div class="verification-code">${code}</div>
          
          <p>Este código é válido por 1 hora. Se você não solicitou este código, por favor ignore este email.</p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Cxlus. Todos os direitos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
