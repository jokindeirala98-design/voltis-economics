import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const { email, projectName } = await req.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Correo inválido' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER || 'jokin@voltisenergia.com',
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Voltis Energía" <${process.env.SMTP_USER || 'jokin@voltisenergia.com'}>`,
      to: email,
      subject: `Informe de Auditoría Energética — ${projectName || 'Voltis Economics'}`,
      html: `
        <div style="font-family: sans-serif; background: #020617; color: white; padding: 40px; border-radius: 16px; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #3b82f6; font-size: 32px; margin: 0;">VOLTIS</h1>
            <p style="color: #64748b; font-size: 12px; letter-spacing: 4px; margin: 4px 0 0;">ANUAL ECONOMICS</p>
          </div>
          <h2 style="color: white; font-size: 20px;">Informe de Auditoría — ${projectName || 'Proyecto'}</h2>
          <p style="color: #94a3b8; line-height: 1.6;">Tu informe de auditoría energética ha sido generado y está disponible. Para obtener el PDF completo, accede a la aplicación y utiliza el botón <strong style="color: #3b82f6;">Generar PDF Auditado</strong>.</p>
          <div style="margin: 32px 0; padding: 20px; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); border-radius: 12px;">
            <p style="color: #94a3b8; margin: 0; font-size: 13px;">Este correo ha sido enviado automáticamente por Voltis Anual Economics. Si tienes alguna consulta, responde a este correo.</p>
          </div>
          <p style="color: #475569; font-size: 12px; text-align: center; margin-top: 32px;">© 2026 Voltis Energía · jokin@voltisenergia.com</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email send error:', error);
    return NextResponse.json({ error: 'Error al enviar el correo. Verifica la configuración SMTP.' }, { status: 500 });
  }
}
