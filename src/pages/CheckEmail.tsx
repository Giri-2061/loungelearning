import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function CheckEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isResending, setIsResending] = useState(false);
  
  // Get email from navigation state
  const email = location.state?.email || 'your email';

  const handleResendEmail = async () => {
    if (!location.state?.email) {
      toast.error('Email address not found. Please sign up again.');
      navigate('/auth');
      return;
    }

    setIsResending(true);
    
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: location.state.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/verified`,
      },
    });

    setIsResending(false);

    if (error) {
      toast.error('Failed to resend email. Please try again.');
    } else {
      toast.success('Verification email sent! Check your inbox.');
    }
  };

  const handleBackToSignIn = () => {
    navigate('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 px-4">
      <Card className="w-full max-w-md shadow-lg border-border/50">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-primary/10 animate-pulse">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">
              Check Your Email
            </CardTitle>
            <CardDescription className="text-muted-foreground mt-2">
              We've sent a verification link to
            </CardDescription>
            <p className="font-medium text-foreground mt-1 break-all">
              {email}
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h3 className="font-medium text-sm text-foreground">What to do next:</h3>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Open your email inbox</li>
              <li>Look for an email from LoungeLearning</li>
              <li>Click the verification link in the email</li>
              <li>You'll be redirected back to continue</li>
            </ol>
          </div>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Can't find the email?</strong> Check your spam or junk folder. 
              The email may take a few minutes to arrive.
            </p>
          </div>

          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleResendEmail}
              disabled={isResending}
              className="w-full"
            >
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>

            <Button
              variant="ghost"
              onClick={handleBackToSignIn}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sign In
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Already verified?{' '}
            <button
              onClick={handleBackToSignIn}
              className="text-primary hover:underline font-medium"
            >
              Sign in here
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
