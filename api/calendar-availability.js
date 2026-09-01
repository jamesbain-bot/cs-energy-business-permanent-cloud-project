const crypto = require('crypto');

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const GOOGLE_SUBJECT = 'james.bain@competasolar.es';

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(clientEmail, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: clientEmail,
    sub: GOOGLE_SUBJECT,
    scope: GOOGLE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));

  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`
    })
  });

  const tokenText = await tokenResponse.text();
  if (!tokenResponse.ok) {
    throw new Error(`Google token request failed (${tokenResponse.status}): ${tokenText.slice(0,300)}`);
  }

  return JSON.parse(tokenText).access_token;
}

function localDateMadrid(iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(iso));
}

function addLocalDateRange(set, startIso, endIso) {
  const startDate = localDateMadrid(startIso);
  const endDate = localDateMadrid(new Date(new Date(endIso).getTime() - 1).toISOString());
  const current = new Date(`${startDate}T12:00:00Z`);
  const finish = new Date(`${endDate}T12:00:00Z`);

  while (current <= finish) {
    set.add(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
}

module.exports = async function handler(req, res) {
  try {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const calendarId = process.env.GOOGLE_CALENDAR_ID;

    if (!raw || !calendarId) {
      return res.status(200).json({
        configured: false,
        busyDates: [],
        missing: [
          !raw ? 'GOOGLE_SERVICE_ACCOUNT_JSON' : null,
          !calendarId ? 'GOOGLE_CALENDAR_ID' : null
        ].filter(Boolean)
      });
    }

    const credentials = JSON.parse(raw);
    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Google service-account JSON is missing client_email or private_key');
    }

    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return res.status(400).json({ error: 'Invalid date range' });
    }

    const token = await getAccessToken(credentials.client_email, credentials.private_key);

    const timeMin = `${from}T00:00:00Z`;
    const toPlusOne = new Date(`${to}T12:00:00Z`);
    toPlusOne.setUTCDate(toPlusOne.getUTCDate() + 1);
    const timeMax = `${toPlusOne.toISOString().slice(0, 10)}T00:00:00Z`;

    const googleResponse = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: 'Europe/Madrid',
        items: [{ id: calendarId }]
      })
    });

    const googleText = await googleResponse.text();
    if (!googleResponse.ok) {
      throw new Error(`Google Calendar request failed (${googleResponse.status}): ${googleText.slice(0,300)}`);
    }

    const body = JSON.parse(googleText);
    const calendarResult = body.calendars?.[calendarId];
    if (calendarResult?.errors?.length) {
      throw new Error(`Google Calendar access error: ${JSON.stringify(calendarResult.errors)}`);
    }

    const busyDates = new Set();
    for (const busy of (calendarResult?.busy || [])) {
      addLocalDateRange(busyDates, busy.start, busy.end);
    }

    return res.status(200).json({
      configured: true,
      busyDates: [...busyDates].sort()
    });
  } catch (error) {
    console.error('calendar-availability:', error);
    return res.status(500).json({
      configured: true,
      busyDates: [],
      error: 'Calendar availability could not be loaded'
    });
  }
};
