import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/server/auth-guards';
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authResult = await requireAuthenticatedUser(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  const user = authResult.user;
  if (user.role !== 'admin' && user.role !== 'social_worker') {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Attachment ID is required.' }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('case_attachments')
    .select('file_name, file_type, file_url')
    .eq('id', id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Attachment not found.' }, { status: 404 });
  }

  const fileUrl = data.file_url;
  if (!fileUrl) {
    return NextResponse.json({ error: 'File content is empty.' }, { status: 404 });
  }

  // If it's a data URI (data:mime;base64,xxxx), decode and stream as binary download
  if (fileUrl.startsWith('data:')) {
    const commaIndex = fileUrl.indexOf(',');
    if (commaIndex !== -1) {
      const metadata = fileUrl.slice(0, commaIndex);
      const base64Data = fileUrl.slice(commaIndex + 1);
      const mimeMatch = metadata.match(/^data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : (data.file_type || 'application/octet-stream');
      const buffer = Buffer.from(base64Data, 'base64');

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${encodeURIComponent(data.file_name)}"`,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'private, max-age=86400',
        },
      });
    }
  }

  // If it's an external or Supabase Storage URL, redirect directly
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
    return NextResponse.redirect(fileUrl);
  }

  return NextResponse.json({ error: 'Invalid file URL format.' }, { status: 500 });
}
