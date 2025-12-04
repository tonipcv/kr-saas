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
  expiryHours?: number;
}

export const createSetPasswordEmail = ({
  name,
  email,
  resetUrl,
  doctorName,
  clinicName,
  clinicLogo,
  isExistingClient,
  currentDoctorName,
  expiryHours = 24,
}: SetPasswordEmailProps) => {
  const content = `
    <div>
      ${isExistingClient ? `
        <p>${doctorName} invited you</p>
        
        <p>
          Hi ${name}, ${currentDoctorName}'s client!<br>
          ${doctorName} invited you to join their protocols on htps.io
        </p>
      ` : `
        <p>Welcome to htps.io</p>
        
        <p>
          ${doctorName || 'Your doctor'} invited you to join htps.io<br>
          Set up your password to get started →
        </p>
      `}
      
      <p><a href="${resetUrl}">${isExistingClient ? 'Accept invitation' : 'Set password'} →</a></p>
      
      <p>This ${isExistingClient ? 'invitation' : 'link'} expires in ${expiryHours}h</p>
    </div>
  `;

  return baseTemplate({
    content,
    clinicName: clinicName || 'htps.io',
    clinicLogo,
    doctorName,
  });
}; 