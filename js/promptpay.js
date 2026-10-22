// Builds a Thai PromptPay QR payload (EMVCo merchant-presented format).
// The payload string is rendered as a QR code by the caller.

function field(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function formatTarget(id) {
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 13) return { tag: '02', value: digits };
  // phone number: 0812345678 -> 0066812345678
  return { tag: '01', value: ('0000000' + '66' + digits.replace(/^0/, '')).slice(-13) };
}

export function promptPayPayload(promptPayId, amount) {
  const target = formatTarget(promptPayId);
  const merchant =
    field('00', 'A000000677010111') + field(target.tag, target.value);
  let payload =
    field('00', '01') +
    field('01', amount ? '12' : '11') +
    field('29', merchant) +
    field('53', '764') +
    (amount ? field('54', Number(amount).toFixed(2)) : '') +
    field('58', 'TH') +
    '6304';
  return payload + crc16(payload);
}
