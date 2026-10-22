// Settings the team may edit before the demo.
export const CONFIG = {
  // PromptPay number that the demo QR pays to. Replace with the team's own
  // number (phone or national ID) to make the QR scannable for real.
  promptPayId: '0000000000',
  prices: { weekday: 1290, weekend: 1790 },
  rerolls: 2,
  vetoFee: 49,
  origin: { name: 'อนุสาวรีย์ชัยฯ กรุงเทพฯ', lon: 100.5383, lat: 13.7649 },
};

export const CATEGORIES = {
  sea: { label: 'ทะเล', icon: 'ti-beach', blurb: 'ลมทะเล แสงเย็น อาหารทะเล' },
  old: { label: 'เมืองเก่า', icon: 'ti-building-castle', blurb: 'ตลาดร้อยปี วัด บ้านไม้' },
  nat: { label: 'ธรรมชาติ', icon: 'ti-trees', blurb: 'หมอก ภูเขา น้ำตก' },
};

export const TRANSPORT = {
  pub: { label: 'ขนส่งสาธารณะ', icon: 'ti-bus', note: 'ประหยัดสุด รถตู้/รถไฟ + สองแถว' },
  grab: { label: 'Grab / วิน', icon: 'ti-motorbike', note: 'ง่ายสุด รถตู้ไป แล้วเรียก Grab ในพื้นที่' },
  self: { label: 'ขับรถเอง', icon: 'ti-steering-wheel', note: 'อิสระสุด นำทางถึงทุกจุด' },
};
