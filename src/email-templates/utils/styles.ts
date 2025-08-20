export const colors = {
  primary: '#1e293b',
  secondary: '#64748b',
  success: '#155724',
  error: '#dc2626',
  warning: '#f59e0b',
  background: '#ffffff',
  text: {
    primary: '#1e293b',
    secondary: '#64748b',
    light: '#94a3b8'
  }
};

export const fonts = {
  default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
};

export const spacing = {
  xs: '5px',
  sm: '10px',
  md: '20px',
  lg: '30px',
  xl: '40px'
};

export const borderRadius = {
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px'
};

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.1)'
};

// Common reusable styles
export const commonStyles = {
  container: `
    max-width: 600px;
    margin: 0 auto;
    padding: ${spacing.lg};
    background-color: ${colors.background};
  `,
  heading: `
    color: ${colors.text.primary};
    margin: 0 0 ${spacing.md} 0;
    font-size: 24px;
    font-weight: 600;
  `,
  paragraph: `
    color: ${colors.text.secondary};
    font-size: 16px;
    line-height: 1.6;
    margin: 0 0 ${spacing.md} 0;
  `,
  card: `
    background: #f8f9fa;
    padding: ${spacing.lg};
    border-radius: ${borderRadius.lg};
    margin: ${spacing.md} 0;
  `
}; 