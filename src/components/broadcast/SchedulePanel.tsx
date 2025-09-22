"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Mail, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ChannelType = 'whatsapp' | 'email';

interface SchedulePanelProps {
  channel: ChannelType;
  onSchedule: (scheduleDate: Date | null) => void;
  onSendNow: () => void;
  onBulkSend?: () => void;
  disabled?: boolean;
  canBulkSend?: boolean;
}

export function SchedulePanel({
  channel,
  onSchedule,
  onSendNow,
  onBulkSend,
  disabled = false,
  canBulkSend = false,
}: SchedulePanelProps) {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState<string>(
    new Date().toTimeString().substring(0, 5)
  );
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);

  const handleSchedule = () => {
    if (!date) return;
    
    const [hours, minutes] = time.split(":").map(Number);
    const scheduledDate = new Date(date);
    scheduledDate.setHours(hours, minutes, 0, 0);
    
    onSchedule(scheduledDate);
    setIsScheduled(true);
  };

  const handleSendNow = () => {
    setIsSending(true);
    onSendNow();
  };

  const handleBulkSend = () => {
    if (onBulkSend) {
      setIsSending(true);
      onBulkSend();
    }
  };

  const formatScheduledDate = (date: Date): string => {
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarIcon className="h-4 w-4" />
          Programar para depois
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                  disabled={disabled}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  locale={ptBR}
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
            
            <div className="relative">
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full"
                disabled={disabled}
              />
              <Clock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          
          <Button 
            className="w-full" 
            onClick={handleSchedule}
            disabled={!date || disabled}
          >
            Agendar {channel === 'whatsapp' ? 'Mensagem' : 'Email'}
          </Button>
          
          {channel === 'email' && (
            <p className="text-xs text-muted-foreground text-center">
              Fora da 24h, use templates aprovados (WhatsApp).
            </p>
          )}
        </div>
        
        <div className="border-t pt-4 space-y-2">
          <Button 
            variant="outline" 
            className="w-full gap-2"
            onClick={handleSendNow}
            disabled={disabled || isSending}
          >
            {channel === 'whatsapp' ? (
              <Smartphone className="h-4 w-4" />
            ) : (
              <Mail className="h-4 w-4" />
            )}
            Enviar agora ({channel === 'whatsapp' ? 'WhatsApp' : 'Email'})
          </Button>
          
          {channel === 'email' && onBulkSend && (
            <Button 
              variant="outline" 
              className="w-full gap-2"
              onClick={handleBulkSend}
              disabled={disabled || isSending || !canBulkSend}
            >
              <Mail className="h-4 w-4" />
              Enviar para todos (Email)
            </Button>
          )}
          
          {isScheduled && (
            <div className="text-sm text-green-600 flex items-center gap-2 justify-center mt-2">
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              <span>✓ Pronto para enviar</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
