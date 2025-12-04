import { baseTemplate } from '../layouts/base';

export interface VerificationEmailProps {
  name: string;
  code: string;
  expiryHours: number;
}

export const createVerificationEmail = ({
  name,
  code,
  expiryHours
}: VerificationEmailProps) => {
  const content = `
    <div>
      <p>Welcome to htps.io</p>
      
      <p>
        Here's your verification code →<br>
        ${code}
      </p>
      
      <p>This code expires in ${expiryHours}h</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io'
  });
}; 