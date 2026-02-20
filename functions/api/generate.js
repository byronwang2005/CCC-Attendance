import qr from 'qr-image';

export async function onRequestPost(context) {
  try {
    const { request } = context;
    const formData = await request.json();
    const { url, timestamp } = formData;

    if (!url) {
      return new Response(JSON.stringify({ error: 'Missing URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!timestamp) {
      return new Response(JSON.stringify({ error: 'Missing timestamp' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const extractScheduleId = (inputUrl) => {
      const m1 = inputUrl.match(/[?&]id=([^&#]+)/);
      const m2 = inputUrl.match(/[?&]scheduleId=([^&#]+)/);
      return m1 ? m1[1] : (m2 ? m2[1] : null);
    };

    const sid = extractScheduleId(url);
    if (!sid) {
      return new Response(JSON.stringify({ error: 'Invalid URL: Cannot find scheduleId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const attendanceUrl = `https://ccc.nottingham.edu.cn/study/attendance?scheduleId=${sid}&time=${timestamp}`;

    // Generate QR Code as PNG
    const qrBuffer = qr.imageSync(attendanceUrl, { type: 'png', margin: 2, size: 10 });

    return new Response(qrBuffer, {
      headers: { 
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="qrcode.png"'
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
