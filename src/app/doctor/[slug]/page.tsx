"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, CheckCircle, Loader2, Mail, User, UserPlus, AlertCircle } from "lucide-react";

interface DoctorInfo {
  id: string;
  name: string;
  image?: string;
  email?: string;
}

// Textos em diferentes idiomas
const translations = {
  pt: {
    welcomeMessage: 'Bem-vindo à área do',
    memberButton: 'Sou membro',
    nonMemberButton: 'Não sou membro',
    enterEmail: 'Digite seu e-mail',
    sendCode: 'Enviar código',
    backToOptions: 'Voltar',
    emailPlaceholder: 'seu@email.com',
    loading: 'Carregando...',
    somethingWrong: 'Ops, algo deu errado',
    codeSent: 'Código enviado!',
    checkEmail: 'Verifique seu e-mail para acessar os protocolos',
    enterCode: 'Digite o código recebido',
    verifyCode: 'Verificar código',
    invalidCode: 'Código inválido',
    tryAgain: 'Tente novamente',
    doctorNotFound: 'Médico não encontrado'
  },
  en: {
    welcomeMessage: 'Welcome to',
    memberButton: 'I am a member',
    nonMemberButton: 'I am not a member',
    enterEmail: 'Enter your email',
    sendCode: 'Send code',
    backToOptions: 'Back',
    emailPlaceholder: 'your@email.com',
    loading: 'Loading...',
    somethingWrong: 'Oops, something went wrong',
    codeSent: 'Code sent!',
    checkEmail: 'Check your email to access protocols',
    enterCode: 'Enter the code received',
    verifyCode: 'Verify code',
    invalidCode: 'Invalid code',
    tryAgain: 'Try again',
    doctorNotFound: 'Doctor not found'
  }
};

export default function DoctorPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');
  const [view, setView] = useState<'options' | 'email' | 'code' | 'register' | 'success'>('options');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);

  // Detectar idioma do navegador
  useEffect(() => {
    const browserLanguage = navigator.language || navigator.languages?.[0] || 'pt';
    const detectedLang = browserLanguage.toLowerCase().startsWith('en') ? 'en' : 'pt';
    setLanguage(detectedLang);
  }, []);

  const t = translations[language];

  // Configuração de estilo
  const styleConfig = {
    bgClass: 'bg-gradient-to-br from-gray-50 via-white to-gray-100',
    cardClass: 'bg-white/80 backdrop-blur-sm border border-gray-200/50 shadow-xl',
    titleClass: 'bg-gradient-to-b from-gray-800 via-gray-600 to-gray-500 bg-clip-text text-transparent',
    subtitleClass: 'bg-gradient-to-b from-gray-600 via-gray-500 to-gray-400 bg-clip-text text-transparent',
    buttonClass: 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl',
    secondaryButtonClass: 'bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300'
  };

  // Carregar informações do médico
  useEffect(() => {
    async function loadDoctorInfo() {
      try {
        const response = await fetch(`/api/v2/doctor-profile/${slug}`);
        const data = await response.json();

        if (response.ok && data.success) {
          setDoctor(data.data);
        } else {
          setError(data.message || t.doctorNotFound);
        }
      } catch (err) {
        setError(t.somethingWrong);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      loadDoctorInfo();
    }
  }, [slug, t.doctorNotFound, t.somethingWrong]);

  // Função para enviar email e solicitar código
  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCodeError('');

    try {
      const response = await fetch('/api/v2/doctor-profile/send-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          doctorId: doctor?.id
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCodeSent(true);
        setView('code');
      } else {
        setCodeError(data.message || t.somethingWrong);
      }
    } catch (err) {
      setCodeError(t.somethingWrong);
    } finally {
      setSubmitting(false);
    }
  };

  // Função para verificar o código
  // Função para verificar código
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCodeError('');

    try {
      const response = await fetch('/api/v2/doctor-profile/verify-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          code,
          doctorId: doctor?.id
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (isNewUser) {
          // Se for um novo usuário, mostrar formulário de registro
          setView('register');
        } else {
          // Se for usuário existente, redirecionar para área logada
          console.log('Resposta da verificação de código:', data);
          
          if (data.token) {
            console.log('Token recebido:', data.token.substring(0, 20) + '...');
            
            // Fazer uma chamada adicional para autenticar o usuário diretamente
            try {
              console.log('Tentando autenticação direta com o token');
              const authResponse = await fetch('/api/auth/token-signin', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: data.token, email }),
              });
              
              const authData = await authResponse.json();
              
              if (authResponse.ok && authData.success) {
                console.log('Autenticação bem-sucedida, redirecionando para área logada');
                // Agora podemos redirecionar para a área logada
                router.push(`/patient/doctor-protocols/${doctor?.id}`);
                return;
              }
            } catch (authError) {
              console.error('Erro na autenticação direta:', authError);
            }
            
            // Fallback para página de login com token
            console.log('Fallback: Redirecionando para página de login com token');
            router.push(`/auth/signin?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(email)}`);
          } else {
            console.log('Token não recebido, redirecionando para login');
            // Fallback para página de login
            router.push('/auth/signin');
          }
        }
      } else {
        setCodeError(data.message || t.invalidCode);
      }
    } catch (err) {
      setCodeError(t.somethingWrong);
    } finally {
      setSubmitting(false);
    }
  };

  // Função para iniciar o fluxo de cadastro
  const handleNonMember = () => {
    setIsNewUser(true);
    setView('email');
  };
  
  // Função para completar o registro
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setCodeError('');

    try {
      // Gerar senha aleatória segura
      const generatePassword = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let password = '';
        for (let i = 0; i < 12; i++) {
          password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return password;
      };

      const password = generatePassword();

      console.log('Iniciando registro com dados:', {
        name,
        email,
        hasPassword: !!password,
        phone,
        doctorId: doctor?.id,
      });

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
          phone,
          doctorId: doctor?.id,
        }),
      });

      const data = await response.json();
      console.log('Resposta do registro:', {
        status: response.status,
        ok: response.ok,
        data
      });

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Erro ao criar conta');
      }

      // Mostrar mensagem de sucesso e redirecionar
      setAccountCreated(true);
      setView('success');
      
      // Se o backend retornou um token, tentar autenticação direta
      if (data.token) {
        try {
          console.log('Tentando autenticação direta após registro');
          const authResponse = await fetch('/api/auth/token-signin', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: data.token, email }),
          });
          
          const authData = await authResponse.json();
          
          if (authResponse.ok && authData.success) {
            console.log('Autenticação após registro bem-sucedida, redirecionando para área logada');
            // Redirecionar para a área logada
            router.push(`/patient/doctor-protocols/${doctor?.id}`);
            return;
          }
        } catch (authError) {
          console.error('Erro na autenticação direta após registro:', authError);
        }
        
        // Fallback para página de login com token
        router.push(`/auth/signin?token=${encodeURIComponent(data.token)}&email=${encodeURIComponent(email)}`);
      } else {
        // Se não tiver token, redirecionar para login normal
        router.push(`/auth/signin?email=${encodeURIComponent(email)}`);
      }
    } catch (error: any) {
      console.error('Erro durante o registro:', error);
      // Exibir mensagem de erro mais detalhada
      setCodeError(error.message || 'Ocorreu um erro durante o registro. Por favor, tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden`}>
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-400/10 via-transparent to-transparent" />
        
        <div className="relative max-w-md mx-auto px-6 py-20">
          
          {/* Skeleton para imagem do médico */}
          <div className="text-center mb-12">
            <div className="relative mb-8">
              <div className="relative w-32 h-32 mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-300 to-gray-400 rounded-full opacity-75 blur-lg animate-pulse" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-r from-gray-200 to-gray-300 border-4 border-white/30 shadow-2xl animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-3">
              {/* Skeleton para texto de boas-vindas */}
              <div className="h-6 bg-gray-200 rounded-md w-3/4 mx-auto animate-pulse" />
              {/* Skeleton para nome do médico */}
              <div className="h-8 bg-gray-300 rounded-md w-1/2 mx-auto animate-pulse" />
            </div>
          </div>

          {/* Skeleton para o card principal */}
          <div className={`${styleConfig.cardClass} rounded-3xl p-8 shadow-2xl`}>
            <div className="space-y-4">
              {/* Skeleton para botão principal */}
              <div className="h-16 bg-gradient-to-r from-blue-300/50 to-indigo-300/50 rounded-xl animate-pulse" />
              
              {/* Skeleton para botão secundário */}
              <div className="h-16 bg-gray-200 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className={`min-h-screen ${styleConfig.bgClass} flex items-center justify-center p-4`}>
        <div className={`${styleConfig.cardClass} rounded-3xl p-8 max-w-md w-full text-center`}>
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className={`text-xl font-semibold mb-2 ${styleConfig.titleClass}`}>
            {t.somethingWrong}
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <Button
            onClick={() => router.push('/')}
            className={styleConfig.buttonClass}
          >
            Voltar para Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${styleConfig.bgClass} relative overflow-hidden`}>
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-200/20 via-transparent to-gray-300/20" />
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-400/10 via-transparent to-transparent" />
      
      <div className="relative max-w-md mx-auto px-6 py-20">
        
        {/* Imagem do médico no topo */}
        <div className="text-center mb-12">
          <div className="relative mb-8">
            {doctor.image ? (
              <div className="relative w-32 h-32 mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                <img 
                  src={doctor.image} 
                  alt={doctor.name}
                  className="relative w-full h-full rounded-full object-cover border-4 border-white/30 shadow-2xl"
                />
              </div>
            ) : (
              <div className="relative w-32 h-32 mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full opacity-75 blur-lg" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-r from-gray-500 to-gray-600 flex items-center justify-center border-4 border-white/30 shadow-2xl">
                  <span className="text-white text-4xl font-light">
                    {doctor.name.charAt(0)}
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-3">
            <p className={`text-lg md:text-xl font-light leading-relaxed ${styleConfig.titleClass}`}>
              {t.welcomeMessage}
            </p>
            <h1 className={`text-xl md:text-2xl font-semibold ${styleConfig.titleClass}`}>
              {doctor.name}
            </h1>
          </div>
        </div>

        {/* Conteúdo principal - muda conforme a view */}
        <div className={`${styleConfig.cardClass} rounded-3xl p-8 shadow-2xl`}>
          {view === 'options' && (
            <div className="space-y-4">
              <Button
                onClick={() => setView('email')}
                className={`w-full ${styleConfig.buttonClass} py-6 text-lg flex items-center justify-center gap-2`}
              >
                <Mail className="h-5 w-5" />
                {t.memberButton}
              </Button>
              
              <Button
                onClick={handleNonMember}
                className={`w-full bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 py-6 text-lg flex items-center justify-center gap-2`}
              >
                <UserPlus className="h-5 w-5" />
                {t.nonMemberButton}
              </Button>
            </div>
          )}

          {view === 'email' && (
            <form onSubmit={handleSendCode} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="email" className={`block text-sm font-medium ${styleConfig.titleClass}`}>
                  {t.enterEmail}
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  required
                  className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl"
                />
              </div>

              {codeError && (
                <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-700 text-sm p-4 rounded-xl">
                  {codeError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setView('options')}
                  className={`flex-1 ${styleConfig.secondaryButtonClass}`}
                >
                  {t.backToOptions}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 ${styleConfig.buttonClass}`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.loading}
                    </>
                  ) : (
                    t.sendCode
                  )}
                </Button>
              </div>
            </form>
          )}

          {view === 'code' && (
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div className="text-center mb-6">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <h3 className={`text-lg font-medium ${styleConfig.titleClass}`}>
                  {t.codeSent}
                </h3>
                <p className="text-gray-600 text-sm">
                  {t.checkEmail}
                </p>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="code" className={`block text-sm font-medium ${styleConfig.titleClass}`}>
                  {t.enterCode}
                </label>
                <Input
                  id="code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').substring(0, 6))}
                  placeholder="000000"
                  required
                  className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl text-center text-2xl tracking-widest"
                  maxLength={6}
                />
              </div>

              {codeError && (
                <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-700 text-sm p-4 rounded-xl">
                  {codeError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setView('email')}
                  className={`flex-1 ${styleConfig.secondaryButtonClass}`}
                >
                  {t.backToOptions}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 ${styleConfig.buttonClass}`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t.loading}
                    </>
                  ) : (
                    t.verifyCode
                  )}
                </Button>
              </div>
            </form>
          )}
          
          {/* Etapa de registro - formulário de perfil */}
          {view === 'register' && (
            <form onSubmit={handleCompleteRegistration} className="space-y-6">
              <div className="text-center mb-6">
                <User className="h-12 w-12 text-blue-500 mx-auto mb-2" />
                <h3 className={`text-lg font-medium ${styleConfig.titleClass}`}>
                  {language === 'pt' ? 'Complete seu perfil' : 'Complete your profile'}
                </h3>
                <p className="text-gray-600 text-sm">
                  {language === 'pt' ? 'Quase lá! Precisamos de mais algumas informações.' : 'Almost there! We need a few more details.'}
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className={`block text-sm font-medium ${styleConfig.titleClass}`}>
                    {language === 'pt' ? 'Nome completo' : 'Full name'}
                  </label>
                  <Input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={language === 'pt' ? 'Seu nome completo' : 'Your full name'}
                    required
                    className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl"
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="phone" className={`block text-sm font-medium ${styleConfig.titleClass}`}>
                    {language === 'pt' ? 'Telefone' : 'Phone'}
                  </label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={language === 'pt' ? '(00) 00000-0000' : '(000) 000-0000'}
                    required
                    className="w-full px-4 py-3 bg-gray-50/80 backdrop-blur-sm border border-gray-300/50 rounded-xl"
                  />
                </div>
              </div>

              {codeError && (
                <div className="bg-red-500/20 backdrop-blur-sm border border-red-400/30 text-red-700 text-sm p-4 rounded-xl">
                  {codeError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setView('code')}
                  className={`flex-1 ${styleConfig.secondaryButtonClass}`}
                >
                  {t.backToOptions}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 ${styleConfig.buttonClass}`}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {language === 'pt' ? 'Criando conta...' : 'Creating account...'}
                    </>
                  ) : (
                    language === 'pt' ? 'Criar conta' : 'Create account'
                  )}
                </Button>
              </div>
            </form>
          )}
          
          {/* Tela de sucesso */}
          {view === 'success' && (
            <div className="space-y-6 text-center">
              <div className="mb-6">
                <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                  <CheckCircle className="h-12 w-12 text-green-500" />
                </div>
                <h3 className={`text-xl font-medium mt-4 ${styleConfig.titleClass}`}>
                  {language === 'pt' ? 'Conta criada com sucesso!' : 'Account created successfully!'}
                </h3>
                <p className="text-gray-600 mt-2">
                  {language === 'pt' ? 'Você será redirecionado para a área do médico em instantes...' : 'You will be redirected to the doctor area shortly...'}
                </p>
              </div>
              
              <Button
                type="button"
                onClick={() => router.push(`/patient/doctor-protocols/${doctor?.id}`)}
                className={`w-full ${styleConfig.buttonClass}`}
              >
                {language === 'pt' ? 'Ir para área do médico' : 'Go to doctor area'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
