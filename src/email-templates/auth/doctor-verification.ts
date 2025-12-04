import { baseTemplate } from '../layouts/base';

export interface DoctorVerificationEmailProps {
  name: string;
  code: string;
  trialDays: number;
}

export const createDoctorVerificationEmail = ({
  name,
  code,
  trialDays
}: DoctorVerificationEmailProps) => {
  const content = `
    <div>
      <p>Welcome to htps.io</p>
      
      <p>
        Here's your verification code →<br>
        ${code}
      </p>
      
      <p>
        Your trial includes:<br>
        • Up to 50 patients<br>
        • Up to 10 protocols<br>
        • Up to 5 courses<br>
        • Up to 30 products<br>
        • ${trialDays} days free trial
      </p>
      
      <p>This code expires in 1h</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'htps.io'
  });
}; 