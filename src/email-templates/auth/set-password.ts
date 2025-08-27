import { baseTemplate } from '../layouts/base';

export interface SetPasswordEmailProps {
  name: string;
  email: string;
  resetUrl: string;
  doctorName?: string;
  clinicName?: string;
  clinicLogo?: string;
  isExistingClient?: boolean;
  currentDoctorName?: string;
}

export const createSetPasswordEmail = ({
  name,
  email,
  resetUrl,
  doctorName,
  clinicName,
  clinicLogo,
  isExistingClient,
  currentDoctorName
}: SetPasswordEmailProps) => {
  const content = `
    <div>
      ${isExistingClient ? `
        <p>${doctorName} invited you</p>
        
        <p>
          Hi ${name}, ${currentDoctorName}'s client!<br>
          ${doctorName} invited you to join their protocols on Zuzz
        </p>
      ` : `
        <p>Welcome to Zuzz</p>
        
        <p>
          ${doctorName || 'Your doctor'} invited you to join Zuzz<br>
          Set up your password to get started →
        </p>
      `}
      
      <p><a href="${resetUrl}">${isExistingClient ? 'Accept invitation' : 'Set password'} →</a></p>
      
      <p>This ${isExistingClient ? 'invitation' : 'link'} expires in 24h</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: 'Zuzz'
  });
}; 