/** Money values are stored as plain decimal THB strings, never floating-point amounts. */
export function thbToSatang(value:unknown):number|null{
  if(typeof value!=='string')return null;
  const clean=value.trim();
  if(!/^(0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(clean))return null;
  const [whole,fraction='']=clean.split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
export type PromotionPricing={originalSatang:number;saleSatang:number;discountPercent:number;savingsSatang:number};
export function getPromotionPricing(original:unknown,sale:unknown):PromotionPricing|null{
  const originalSatang=thbToSatang(original),saleSatang=thbToSatang(sale);
  if(originalSatang===null||saleSatang===null||saleSatang<1||originalSatang<=saleSatang)return null;
  const discountPercent=Math.round((originalSatang-saleSatang)/originalSatang*100);
  return {originalSatang,saleSatang,savingsSatang:originalSatang-saleSatang,discountPercent};
}
const thaiMoney=new Intl.NumberFormat('th-TH',{minimumFractionDigits:0,maximumFractionDigits:2});
export function formatThaiBaht(satang:number):string{
  return '฿'+thaiMoney.format(satang/100);
}
