// Rule-based recommendation engine. Every statement is produced by an explicit, auditable rule
// tied to the scorecard result - no generative text. Output is bilingual (English / Arabic) and
// follows the structure of the Innovation Oasis soil reports: overall interpretation, key
// constraints, guidance by crop group, short-term and long-term actions.
import { Methodology, INDICATOR_LABEL } from './methodology';
import { ScoreResult } from './score';
import { Crop, WaterValues, relativeYield, gypsumRequirement, leachingRequirement, classifyWater } from './agronomy';

export interface Bi { en: string; ar: string }
export interface RecoItem extends Bi { id: string; sev: 1 | 2 | 3; topic: string }
export interface Estimate { key: string; label: Bi; value: string; note: Bi }
export interface Reco {
  overall: Bi; constraints: RecoItem[]; strengths: Bi[];
  groups: { vegetables: Bi; field: Bi; trees: Bi };
  crop?: Bi; shortTerm: RecoItem[]; longTerm: RecoItem[];
  estimates: Estimate[]; monitoring: Bi[];
}
export interface RecoContext { texture?: string; crop?: Crop; system?: string; water?: WaterValues; bd?: number; minCoverage?: number }

const n = (x: number, dp = 2) => (Math.round(x * 10 ** dp) / 10 ** dp).toString();
const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(and === 'and' ? ', ' : '، ') + ` ${and === 'and' ? 'and' : 'و'} ` + xs[xs.length - 1]);
const el: Record<string, Bi> = {
  fe: { en: 'iron', ar: 'الحديد' }, zn: { en: 'zinc', ar: 'الزنك' }, mn: { en: 'manganese', ar: 'المنغنيز' },
  cu: { en: 'copper', ar: 'النحاس' }, b: { en: 'boron', ar: 'البورون' },
};

export function recommend(m: Methodology, res: ScoreResult, ctx: RecoContext = {}): Reco {
  const s = (k: string) => res.byKey[k]?.score;
  const v = (k: string) => res.used[k];
  const C: RecoItem[] = [], ST: RecoItem[] = [], LT: RecoItem[] = [], strengths: Bi[] = [], estimates: Estimate[] = [], monitoring: Bi[] = [];
  const add = (arr: RecoItem[], id: string, sev: 1 | 2 | 3, topic: string, en: string, ar: string) => { if (!arr.some(x => x.id === id)) arr.push({ id, sev, topic, en, ar }); };
  const sevOf = (score?: number): 1 | 2 | 3 => (score !== undefined && score <= 2 ? 1 : score === 3 ? 2 : 3);
  const sandy = /sand/i.test(ctx.texture ?? '') || (res.used.cec !== undefined && (res.used.cec as number) < 5);

  const ece = v('ece'), sar = v('sar'), esp = v('esp'), cec = v('cec');
  const eceS = s('ece'), sarS = s('sar'), espS = s('esp');
  const sodS = Math.min(sarS ?? 5, espS ?? 5);
  const saline = eceS !== undefined && eceS <= 3;
  const dataError = (esp !== undefined && esp > 60) || (cec !== undefined && cec > 50);
  const sodic = !dataError && (sarS !== undefined || espS !== undefined) && sodS <= 3;
  const stronglySodic = (esp !== undefined && esp >= 15) || (sar !== undefined && sar >= 13);

  // ---------------------------------------------------------------- salinity
  if (ece !== undefined && eceS !== undefined) {
    if (eceS === 5) strengths.push({ en: `Non-saline (ECe ${n(ece)} dS/m)`, ar: `التربة غير ملحية (ECe ${n(ece)} ديسيسيمنز/م)` });
    if (eceS === 4) {
      add(C, 'sal', 3, 'salinity', `Slightly saline (ECe ${n(ece)} dS/m). Salt-sensitive crops can start to lose yield at this level.`, `ملوحة خفيفة (ECe ${n(ece)} ديسيسيمنز/م). قد تبدأ المحاصيل الحساسة للأملاح بفقد جزء من إنتاجها عند هذا المستوى.`);
      add(ST, 'sal-lf', 3, 'salinity', 'Keep a small leaching fraction in each irrigation so salts do not build up in the root zone.', 'الحفاظ على نسبة غسيل بسيطة في كل رية حتى لا تتراكم الأملاح في منطقة الجذور.');
    }
    if (eceS === 3) {
      add(C, 'sal', 2, 'salinity', `Moderately saline (ECe ${n(ece)} dS/m). Yield of most vegetables is reduced; water uptake is restricted.`, `ملوحة متوسطة (ECe ${n(ece)} ديسيسيمنز/م). ينخفض إنتاج معظم الخضروات ويقل امتصاص النبات للماء.`);
      add(ST, 'sal-leach', 2, 'salinity', 'Schedule leaching irrigations with the best-quality water available before planting and at intervals during the season.', 'برمجة ريات غسيل باستخدام أفضل مياه متاحة قبل الزراعة وعلى فترات خلال الموسم.');
      add(ST, 'sal-drip', 2, 'salinity', 'Irrigate little and often by drip, keeping the root zone moist so salts stay diluted and move to the edge of the wetted zone.', 'الري بالتنقيط بكميات قليلة ومتكررة للحفاظ على رطوبة منطقة الجذور وإبقاء الأملاح مخففة عند أطراف المنطقة المبتلة.');
    }
    if (eceS === 2) {
      add(C, 'sal', 1, 'salinity', `Strongly saline (ECe ${n(ece)} dS/m). Only salt-tolerant crops will yield satisfactorily without reclamation.`, `ملوحة شديدة (ECe ${n(ece)} ديسيسيمنز/م). لا تعطي إنتاجاً مقبولاً سوى المحاصيل المتحملة للملوحة ما لم تُستصلح التربة.`);
      add(ST, 'sal-reclaim', 1, 'salinity', 'Carry out reclamation leaching before the next crop: apply water in several successive applications to move salts below the root zone, and confirm drainage is adequate.', 'إجراء غسيل استصلاحي قبل المحصول القادم بإضافة المياه على دفعات متتالية لإزاحة الأملاح أسفل منطقة الجذور، مع التأكد من كفاية الصرف.');
      add(ST, 'sal-drip', 2, 'salinity', 'Irrigate little and often by drip, keeping the root zone moist so salts stay diluted and move to the edge of the wetted zone.', 'الري بالتنقيط بكميات قليلة ومتكررة للحفاظ على رطوبة منطقة الجذور وإبقاء الأملاح مخففة عند أطراف المنطقة المبتلة.');
    }
    if (eceS === 1) {
      add(C, 'sal', 1, 'salinity', `Very strongly saline (ECe ${n(ece)} dS/m). The soil is unsuitable for conventional crops until it is reclaimed.`, `ملوحة شديدة جداً (ECe ${n(ece)} ديسيسيمنز/م). التربة غير صالحة للمحاصيل التقليدية قبل استصلاحها.`);
      add(ST, 'sal-reclaim', 1, 'salinity', 'Carry out reclamation leaching before any planting: apply water in several successive applications to move salts below the root zone, and confirm drainage is adequate.', 'إجراء غسيل استصلاحي قبل أي زراعة بإضافة المياه على دفعات متتالية لإزاحة الأملاح أسفل منطقة الجذور، مع التأكد من كفاية الصرف.');
      add(ST, 'sal-source', 1, 'salinity', 'Identify the salt source: test the irrigation water (EC, SAR, chloride) and check for a shallow saline water table.', 'تحديد مصدر الأملاح: تحليل مياه الري (EC و SAR والكلوريد) والتحقق من وجود مستوى ماء أرضي مالح قريب.');
    }
    if (eceS <= 3) {
      add(LT, 'sal-water', 2, 'salinity', 'Manage salinity as a water issue: monitor irrigation-water EC each season and blend or switch to lower-salinity water where possible.', 'إدارة الملوحة بوصفها مسألة مياه: مراقبة ملوحة مياه الري كل موسم وخلطها أو استبدالها بمياه أقل ملوحة حيثما أمكن.');
      add(LT, 'sal-mulch', 3, 'salinity', 'Use mulch or crop residues to cut surface evaporation, which draws salts upward between irrigations.', 'استخدام التغطية (الملش) أو بقايا المحاصيل للحد من التبخر السطحي الذي يسحب الأملاح إلى أعلى بين الريات.');
    }
  }

  // ---------------------------------------------------------------- sodicity
  if (sodic) {
    const bits = [sar !== undefined ? `SAR ${n(sar)}` : '', esp !== undefined ? `ESP ${n(esp)}%` : ''].filter(Boolean).join(', ');
    const bitsAr = [sar !== undefined ? `SAR ${n(sar)}` : '', esp !== undefined ? `ESP ${n(esp)}٪` : ''].filter(Boolean).join('، ');
    if (stronglySodic) add(C, 'sod', 1, 'sodicity', `Sodic conditions (${bits}). Excess sodium disperses soil particles, seals the surface and slows water entry.`, `ظروف صودية (${bitsAr}). الصوديوم الزائد يفرّق حبيبات التربة ويغلق سطحها ويبطئ تسرب الماء.`);
    else add(C, 'sod', sevOf(sodS), 'sodicity', `Elevated sodium (${bits}). There is a risk of structural decline and reduced infiltration if sodium keeps accumulating.`, `ارتفاع في الصوديوم (${bitsAr}). هناك خطر تدهور بناء التربة وانخفاض النفاذية إذا استمر تراكم الصوديوم.`);
    if (saline) add(ST, 'sod-gyp', 1, 'sodicity', 'Apply gypsum and incorporate it before leaching. In a saline-sodic soil, leaching without a calcium source removes the salts but leaves the sodium, and the soil can disperse.', 'إضافة الجبس الزراعي وخلطه بالتربة قبل الغسيل. في التربة الملحية الصودية يزيل الغسيل دون مصدر كالسيوم الأملاح ويبقي الصوديوم، فتتفرق حبيبات التربة.');
    else add(ST, 'sod-gyp', sevOf(sodS), 'sodicity', 'Apply gypsum to replace exchangeable sodium with calcium, then irrigate to wash the displaced sodium below the root zone.', 'إضافة الجبس الزراعي لإحلال الكالسيوم محل الصوديوم المتبادل، ثم الري لغسل الصوديوم المُزاح أسفل منطقة الجذور.');
    add(LT, 'sod-maint', 2, 'sodicity', 'Re-test SAR and ESP after reclamation and repeat gypsum at maintenance rates while irrigation water remains sodium-dominated.', 'إعادة تحليل SAR و ESP بعد الاستصلاح وتكرار إضافة الجبس بمعدلات وقائية ما دامت مياه الري غنية بالصوديوم.');
    if (esp !== undefined && cec !== undefined && esp > 10) {
      const gr = gypsumRequirement(esp, cec, { bd: ctx.bd });
      estimates.push({
        key: 'gypsum', label: { en: 'Gypsum requirement', ar: 'الاحتياج من الجبس الزراعي' }, value: `${n(gr, 1)} t/ha`,
        note: { en: `To bring ESP from ${n(esp, 1)}% to 10% in the top 30 cm (CEC ${n(cec, 1)} cmolc/kg, bulk density ${n(ctx.bd ?? 1.5, 2)} g/cm³, 85% pure gypsum). Split rates above 5 t/ha over two applications.`, ar: `لخفض ESP من ${n(esp, 1)}٪ إلى 10٪ في الطبقة السطحية (30 سم) (CEC ${n(cec, 1)} سنتيمول/كغ، الكثافة الظاهرية ${n(ctx.bd ?? 1.5, 2)} غ/سم³، جبس بنقاوة 85٪). تُقسَّم المعدلات التي تزيد على 5 طن/هكتار على دفعتين.` },
      });
    }
  } else if (dataError) {
    add(C, 'data-error', 1, 'data', `Reported exchange values are not plausible (ESP ${esp !== undefined ? n(esp, 1) + '%' : 'n/a'}, CEC ${cec !== undefined ? n(cec, 1) : 'n/a'} cmolc/kg). Sodium and exchange-capacity advice is withheld until the laboratory confirms them.`, `قيم التبادل المسجّلة غير منطقية (ESP ${esp !== undefined ? n(esp, 1) + '٪' : 'غير متوفر'}، CEC ${cec !== undefined ? n(cec, 1) : 'غير متوفر'} سنتيمول/كغ). تُحجب توصيات الصوديوم والسعة التبادلية إلى أن يؤكدها المختبر.`);
    add(ST, 'data-verify', 1, 'data', 'Ask the laboratory to re-check exchangeable sodium and CEC for this sample (units and dilution) before any gypsum is applied.', 'طلب إعادة التحقق من الصوديوم المتبادل والسعة التبادلية لهذه العينة من المختبر (الوحدات والتخفيف) قبل إضافة أي جبس.');
  } else if (sarS === 5 && (espS === undefined || espS === 5)) strengths.push({ en: 'No sodium hazard (SAR and ESP in the optimum band)', ar: 'لا يوجد خطر صودية (SAR و ESP ضمن النطاق الأمثل)' });

  // ---------------------------------------------------------------- organic matter
  const om = v('om'), omS = s('om');
  if (om !== undefined && omS !== undefined) {
    if (omS >= 5) strengths.push({ en: `Organic matter is high for an arid sandy soil (${n(om)}%)`, ar: `المادة العضوية مرتفعة بالنسبة لتربة رملية جافة (${n(om)}٪)` });
    else {
      const low = omS <= 2;
      add(C, 'om', sevOf(omS), 'organic', low ? `Very low organic matter (${n(om)}%). Water and nutrient retention are poor and biological activity is minimal.` : `Organic matter (${n(om)}%) is ${omS === 4 ? 'good for a desert soil but below the 2% target' : 'moderate; typical of an improved desert soil'}.`, low ? `المادة العضوية منخفضة جداً (${n(om)}٪). احتفاظ التربة بالماء والعناصر ضعيف والنشاط الحيوي محدود.` : `المادة العضوية (${n(om)}٪) ${omS === 4 ? 'جيدة لتربة صحراوية لكنها دون الهدف (2٪)' : 'متوسطة، وهو المعتاد في تربة صحراوية محسّنة'}.`);
      if (omS <= 3) add(ST, 'om-compost', sevOf(omS), 'organic', 'Incorporate mature compost or well-decomposed manure into the root zone before planting. Use a tested, low-salt product.', 'خلط كمبوست ناضج أو سماد عضوي متحلل جيداً في منطقة الجذور قبل الزراعة، مع استخدام منتج مُحلَّل ومنخفض الأملاح.');
      add(LT, 'om-build', omS <= 3 ? 2 : 3, 'organic', 'Build organic matter season by season: repeat compost applications, return crop residues and use green manure or cover crops between seasons. Gains are slow in hot arid soils and are lost quickly if inputs stop.', 'بناء المادة العضوية موسماً بعد موسم: تكرار إضافة الكمبوست، وإعادة بقايا المحاصيل للتربة، واستخدام السماد الأخضر أو محاصيل التغطية بين المواسم. الزيادة بطيئة في الترب الحارة الجافة وتُفقد سريعاً عند توقف الإضافات.');
      const target = omS <= 2 ? 0.5 : omS === 3 ? 1 : 2;
      const deficit = (target - om) / 100 * (10000 * 0.2 * (ctx.bd ?? 1.5));
      if (deficit > 0) estimates.push({
        key: 'om', label: { en: `Organic matter gap to the next band (${target}%)`, ar: `فجوة المادة العضوية للوصول إلى النطاق التالي (${target}٪)` }, value: `${n(deficit, 1)} t/ha`,
        note: { en: `Stable organic matter needed in the top 20 cm to move from ${n(om)}% to ${target}%. Compost supplies only part of its mass as stable organic matter, so plan this as a multi-season programme.`, ar: `كمية المادة العضوية الثابتة اللازمة في الطبقة السطحية (20 سم) للانتقال من ${n(om)}٪ إلى ${target}٪. الكمبوست يوفر جزءاً فقط من كتلته كمادة عضوية ثابتة، لذا يُخطط لذلك كبرنامج متعدد المواسم.` },
      });
    }
  }

  // ---------------------------------------------------------------- pH and carbonates
  const ph = v('ph'), phS = s('ph');
  if (ph !== undefined && phS !== undefined) {
    if (phS === 5) strengths.push({ en: `pH ${n(ph)} is in the optimum range for nutrient availability`, ar: `الرقم الهيدروجيني ${n(ph)} ضمن النطاق الأمثل لإتاحة العناصر` });
    else if (ph > 7.5) {
      add(C, 'ph', ph > 8.5 ? 1 : sevOf(phS), 'ph', ph > 8.5 ? `Strongly alkaline (pH ${n(ph)}). This usually indicates sodium carbonate; phosphorus and micronutrient availability is severely reduced.` : `Alkaline reaction (pH ${n(ph)}), typical of calcareous soils. Availability of phosphorus, iron, zinc and manganese is reduced.`, ph > 8.5 ? `تربة شديدة القلوية (pH ${n(ph)})، ويدل ذلك غالباً على وجود كربونات الصوديوم؛ إتاحة الفوسفور والعناصر الصغرى منخفضة بشدة.` : `تفاعل قلوي (pH ${n(ph)}) وهو المعتاد في الترب الكلسية. تقل إتاحة الفوسفور والحديد والزنك والمنغنيز.`);
      add(ST, 'ph-acid', sevOf(phS), 'ph', 'Use acid-forming fertilisers (ammonium sulfate, urea phosphate, phosphoric acid in fertigation) and supply micronutrients as chelates or foliar sprays rather than relying on soil reserves.', 'استخدام الأسمدة ذات التأثير الحامضي (سلفات الأمونيوم، يوريا فوسفات، حمض الفوسفوريك مع مياه الري) وإضافة العناصر الصغرى في صورة مخلبية أو رشاً ورقياً بدلاً من الاعتماد على مخزون التربة.');
      add(LT, 'ph-s', 3, 'ph', 'Elemental sulfur and organic matter lower pH only locally and slowly in calcareous soil; apply them in the planting band or root zone rather than broadcast.', 'الكبريت الزراعي والمادة العضوية يخفضان الرقم الهيدروجيني موضعياً وببطء في الترب الكلسية؛ يُضافان في خط الزراعة أو منطقة الجذور لا نثراً على كامل المساحة.');
    } else {
      add(C, 'ph', sevOf(phS), 'ph', `Acidic reaction (pH ${n(ph)}), unusual for UAE soils. Confirm the result before acting.`, `تفاعل حامضي (pH ${n(ph)}) وهو غير معتاد في ترب الإمارات. يُنصح بتأكيد النتيجة قبل اتخاذ أي إجراء.`);
      add(ST, 'ph-lime', 2, 'ph', 'Re-test pH. If confirmed below 6.0, apply agricultural lime at a rate set by a buffer test.', 'إعادة قياس الرقم الهيدروجيني. إذا تأكد أنه أقل من 6.0 يُضاف الجير الزراعي بمعدل يحدده اختبار السعة التنظيمية.');
    }
  }
  const caco3 = v('caco3');
  if (caco3 !== undefined && caco3 >= 15) add(C, 'caco3', 3, 'ph', `Strongly calcareous (CaCO₃ ${n(caco3, 1)}%). Applied phosphorus is fixed quickly and lime-induced iron chlorosis is likely.`, `تربة شديدة الكلسية (CaCO₃ ${n(caco3, 1)}٪). يتثبت الفوسفور المضاف بسرعة ويُتوقع ظهور اصفرار نقص الحديد.`);
  const hco3 = res.derived.hco3_meq;
  if (hco3 !== undefined && hco3 > 5) {
    add(C, 'hco3', hco3 > 10 ? 2 : 3, 'ph', `High bicarbonate in the soil extract (${n(hco3, 1)} meq/L). Bicarbonate raises root-zone pH, precipitates calcium and induces iron chlorosis.`, `ارتفاع البيكربونات في مستخلص التربة (${n(hco3, 1)} ملّيمكافئ/لتر). ترفع البيكربونات pH منطقة الجذور وترسّب الكالسيوم وتسبب اصفرار نقص الحديد.`);
    add(ST, 'hco3-acid', 3, 'ph', 'Acidify the irrigation water (target pH 6.0-6.5 at the emitter) to neutralise bicarbonate and keep drippers free of scale.', 'تحميض مياه الري (pH مستهدف 6.0–6.5 عند النقاط) لمعادلة البيكربونات ومنع انسداد النقاطات بالترسبات.');
  }
  const cl = res.derived.cl_meq;
  if (cl !== undefined && cl > 10) {
    add(C, 'cl', cl > 30 ? 1 : 2, 'salinity', `High chloride in the soil extract (${n(cl, 0)} meq/L). Sensitive crops show leaf-margin burn above about 10 meq/L.`, `ارتفاع الكلوريد في مستخلص التربة (${n(cl, 0)} ملّيمكافئ/لتر). تظهر حروق حواف الأوراق في المحاصيل الحساسة فوق نحو 10 ملّيمكافئ/لتر.`);
    add(ST, 'cl-so4', 3, 'salinity', 'Use sulfate-based fertilisers (potassium sulfate rather than potassium chloride) and avoid wetting foliage with saline water.', 'استخدام الأسمدة الكبريتاتية (سلفات البوتاسيوم بدلاً من كلوريد البوتاسيوم) وتجنب بلل الأوراق بالمياه المالحة.');
  }

  // ---------------------------------------------------------------- CEC / texture
  const cecS = s('cec');
  if (cec !== undefined && cecS !== undefined && !dataError) {
    if (cecS <= 3) {
      add(C, 'cec', cecS <= 2 ? 2 : 3, 'retention', `Low cation exchange capacity (${n(cec)} cmolc/kg). The soil holds few nutrients, so single large fertiliser doses are leached.`, `السعة التبادلية الكاتيونية منخفضة (${n(cec)} سنتيمول/كغ). التربة تحتفظ بقليل من العناصر، لذا تُفقد الجرعات السمادية الكبيرة بالغسيل.`);
      add(ST, 'split', 2, 'retention', 'Split fertiliser into small, frequent fertigation doses matched to crop demand instead of a few large applications.', 'تقسيم الأسمدة إلى جرعات صغيرة ومتكررة مع مياه الري وفق احتياج المحصول بدلاً من إضافات كبيرة قليلة.');
    } else strengths.push({ en: `Good nutrient-holding capacity for a desert soil (CEC ${n(cec)} cmolc/kg)`, ar: `سعة جيدة للاحتفاظ بالعناصر لتربة صحراوية (CEC ${n(cec)} سنتيمول/كغ)` });
  }
  if (sandy) add(LT, 'water', 3, 'retention', 'Sandy texture: schedule short, frequent irrigations from soil-moisture readings, and avoid deep percolation that carries nitrogen below the roots.', 'القوام الرملي: جدولة ريات قصيرة ومتكررة اعتماداً على قراءات رطوبة التربة، وتجنب التسرب العميق الذي يحمل النيتروجين أسفل الجذور.');

  // ---------------------------------------------------------------- macronutrients
  const N = v('n'), nS = s('n');
  if (N !== undefined && nS !== undefined && nS <= 3) {
    add(C, 'n', sevOf(nS), 'nutrients', `Low available nitrogen (${n(N, 1)} mg/kg). Nitrogen leaches readily from sandy soil.`, `النيتروجين المتاح منخفض (${n(N, 1)} ملغ/كغ). يُغسل النيتروجين بسهولة من التربة الرملية.`);
    add(ST, 'n-split', sevOf(nS), 'nutrients', 'Supply nitrogen in weekly or more frequent fertigation doses through the season, starting soon after establishment.', 'إضافة النيتروجين على جرعات أسبوعية أو أكثر تكراراً مع مياه الري طوال الموسم، بدءاً من مرحلة ما بعد التأسيس مباشرة.');
  }
  const P = v('p'), pS = s('p');
  if (P !== undefined && pS !== undefined) {
    const pTop = (m.indicators.find(i => i.key === 'p')?.cuts as number[] | undefined)?.[0] ?? 20;
    if (pS <= 3) {
      add(C, 'p', sevOf(pS), 'nutrients', `Low available phosphorus (Olsen P ${n(P, 1)} mg/kg). Phosphorus is fixed as calcium phosphate in calcareous soil.`, `الفوسفور المتاح منخفض (أولسن ${n(P, 1)} ملغ/كغ). يتثبت الفوسفور على هيئة فوسفات الكالسيوم في الترب الكلسية.`);
      add(ST, 'p-band', sevOf(pS), 'nutrients', 'Apply phosphorus close to the roots - banded at planting or as phosphoric acid / MAP in fertigation - in small repeated doses rather than broadcast.', 'إضافة الفوسفور قرب الجذور، تسطيراً عند الزراعة أو كحمض فوسفوريك أو MAP مع مياه الري، على جرعات صغيرة متكررة لا نثراً.');
    } else if (P >= 2 * pTop) {
      add(C, 'p-high', 3, 'nutrients', `Phosphorus is well above the sufficiency level (Olsen P ${n(P, 1)} mg/kg). Excess phosphorus suppresses zinc and iron uptake.`, `الفوسفور أعلى بكثير من مستوى الكفاية (أولسن ${n(P, 1)} ملغ/كغ). الفوسفور الزائد يثبط امتصاص الزنك والحديد.`);
      add(ST, 'p-stop', 3, 'nutrients', 'Withhold phosphorus fertiliser and phosphorus-rich manures until the soil test returns to the adequate range.', 'إيقاف التسميد الفوسفاتي والأسمدة العضوية الغنية بالفوسفور إلى أن يعود التحليل إلى النطاق الكافي.');
    } else strengths.push({ en: `Phosphorus supply is adequate (Olsen P ${n(P, 1)} mg/kg)`, ar: `إمداد الفوسفور كافٍ (أولسن ${n(P, 1)} ملغ/كغ)` });
  }
  const K = v('k'), kS = s('k');
  if (K !== undefined && kS !== undefined) {
    if (kS <= 3) {
      add(C, 'k', sevOf(kS), 'nutrients', `Low available potassium (${n(K, 0)} mg/kg).`, `البوتاسيوم المتاح منخفض (${n(K, 0)} ملغ/كغ).`);
      add(ST, 'k-sop', sevOf(kS), 'nutrients', 'Add potassium in split doses, increasing the share from flowering onward. Prefer potassium sulfate or potassium nitrate over potassium chloride.', 'إضافة البوتاسيوم على دفعات مع زيادة حصته من مرحلة الإزهار، ويُفضّل سلفات أو نترات البوتاسيوم على كلوريد البوتاسيوم.');
    } else strengths.push({ en: `Potassium supply is adequate (${n(K, 0)} mg/kg)`, ar: `إمداد البوتاسيوم كافٍ (${n(K, 0)} ملغ/كغ)` });
  }

  // ---------------------------------------------------------------- secondary nutrients
  const caS = s('ca'), mgS = s('mg'), sS = s('s');
  if (caS !== undefined && caS <= 3) {
    add(C, 'ca', caS <= 2 ? 2 : 3, 'nutrients', `Low exchangeable calcium (${n(v('ex_ca') as number, 0)} mg/kg).`, `الكالسيوم المتبادل منخفض (${n(v('ex_ca') as number, 0)} ملغ/كغ).`);
    add(ST, 'ca-add', 3, 'nutrients', 'Supply calcium as gypsum to the soil or calcium nitrate in fertigation; keep calcium and phosphate or sulfate fertilisers in separate tanks.', 'إضافة الكالسيوم كجبس زراعي للتربة أو نترات الكالسيوم مع مياه الري، مع فصل خزان الكالسيوم عن الأسمدة الفوسفاتية والكبريتاتية.');
  }
  if (mgS !== undefined && mgS <= 3) {
    add(C, 'mg', mgS <= 2 ? 2 : 3, 'nutrients', `Low exchangeable magnesium (${n(v('ex_mg') as number, 0)} mg/kg).`, `المغنيسيوم المتبادل منخفض (${n(v('ex_mg') as number, 0)} ملغ/كغ).`);
    add(ST, 'mg-add', 3, 'nutrients', 'Add magnesium sulfate through fertigation or as a foliar spray, and avoid heavy potassium doses that compete with magnesium uptake.', 'إضافة سلفات المغنيسيوم مع مياه الري أو رشاً ورقياً، وتجنب الجرعات العالية من البوتاسيوم التي تنافس امتصاص المغنيسيوم.');
  }
  if (sS !== undefined && sS <= 3) {
    add(C, 's', 3, 'nutrients', `Low available sulfur (${n(v('s') as number, 1)} mg/kg).`, `الكبريت المتاح منخفض (${n(v('s') as number, 1)} ملغ/كغ).`);
    add(ST, 's-add', 3, 'nutrients', 'Use sulfate-form fertilisers (ammonium sulfate, potassium sulfate) or gypsum to supply sulfur.', 'استخدام الأسمدة الكبريتاتية (سلفات الأمونيوم، سلفات البوتاسيوم) أو الجبس لتوفير الكبريت.');
  }

  // ---------------------------------------------------------------- micronutrients
  const micDef = ['fe', 'zn', 'mn', 'cu'].filter(k => (s(k) ?? 5) <= 3);
  const bV = v('b'), bS = s('b'), bSide = res.byKey['b']?.side;
  const bLow = bS !== undefined && bS <= 3 && bSide === 'low';
  const bHigh = bS !== undefined && bS <= 4 && bSide === 'high';
  const defs = [...micDef, ...(bLow ? ['b'] : [])];
  if (defs.length) {
    const worst = Math.min(...defs.map(k => s(k) ?? 5));
    const detail = defs.map(k => `${el[k].en} ${n(v(k) as number)} mg/kg`);
    add(C, 'micro', sevOf(worst), 'micronutrients', `Micronutrient deficiency: ${list(detail, 'and')}. This is expected at high pH in calcareous sand, where these elements are held in unavailable forms.`, `نقص في العناصر الصغرى: ${list(defs.map(k => `${el[k].ar} ${n(v(k) as number)} ملغ/كغ`), 'و')}. وهذا متوقع عند ارتفاع pH في الرمال الكلسية حيث تكون هذه العناصر في صور غير متاحة.`);
    add(ST, 'micro-foliar', sevOf(worst), 'micronutrients', `Start foliar sprays of ${list(defs.map(k => el[k].en), 'and')} early in the season and repeat at 2-3 week intervals; foliar feeding bypasses soil fixation.`, `بدء الرش الورقي بـ${list(defs.map(k => el[k].ar), 'و')} مبكراً في الموسم وتكراره كل 2–3 أسابيع؛ الرش الورقي يتجاوز تثبيت العناصر في التربة.`);
    if (defs.includes('fe')) add(ST, 'fe-eddha', 2, 'micronutrients', 'For iron, use Fe-EDDHA chelate through the drip line: it stays available at high pH, where Fe-EDTA and iron sulfate do not.', 'للحديد يُستخدم مخلب Fe-EDDHA عبر شبكة التنقيط لأنه يبقى متاحاً عند pH المرتفع بخلاف Fe-EDTA وسلفات الحديد.');
    if (defs.includes('zn')) add(ST, 'zn-add', 2, 'micronutrients', 'For zinc, apply zinc sulfate banded in the root zone or Zn-EDTA by fertigation, and keep phosphorus applications moderate.', 'للزنك تُضاف سلفات الزنك تسطيراً في منطقة الجذور أو Zn-EDTA مع مياه الري، مع الاعتدال في التسميد الفوسفاتي.');
    if (bLow) add(ST, 'b-add', 3, 'micronutrients', 'Apply boron only in small, measured doses (foliar or fertigation): the margin between deficiency and toxicity is narrow.', 'إضافة البورون بجرعات صغيرة ومحسوبة فقط (رشاً أو مع الري) لأن الهامش بين النقص والسمية ضيق.');
    add(LT, 'micro-prog', 3, 'micronutrients', 'Include micronutrients in the routine fertigation programme and confirm crop status with leaf tissue analysis mid-season.', 'إدراج العناصر الصغرى في برنامج التسميد الدوري والتحقق من حالة المحصول بتحليل الأوراق في منتصف الموسم.');
  } else if (['fe', 'zn', 'mn', 'cu'].every(k => (s(k) ?? 0) >= 4)) strengths.push({ en: 'Micronutrient levels (Fe, Zn, Mn, Cu) are adequate', ar: 'مستويات العناصر الصغرى (الحديد، الزنك، المنغنيز، النحاس) كافية' });
  if (bHigh && bV !== undefined) {
    add(C, 'b-high', bS !== undefined && bS <= 2 ? 1 : bS === 3 ? 2 : 3, 'micronutrients', `Elevated boron (${n(bV)} mg/kg)${bV > 4 ? ' in the toxic range for sensitive crops' : ''}. Boron accumulates in arid soils irrigated with boron-bearing water.`, `ارتفاع البورون (${n(bV)} ملغ/كغ)${bV > 4 ? ' ضمن النطاق السام للمحاصيل الحساسة' : ''}. يتراكم البورون في الترب الجافة المروية بمياه تحتوي عليه.`);
    add(ST, 'b-leach', 2, 'micronutrients', 'Stop any boron-containing fertiliser, test the irrigation water for boron, and leach: boron needs roughly three times more water to remove than chloride salts.', 'إيقاف أي سماد يحتوي على البورون، وتحليل مياه الري للبورون، وإجراء الغسيل: يحتاج البورون إلى نحو ثلاثة أضعاف كمية الماء اللازمة لإزالة أملاح الكلوريد.');
  }

  // ---------------------------------------------------------------- supplementary
  for (const sp of res.supplementary) {
    if (sp.key === 'bd' && sp.cls === 'poor') { add(C, 'bd', 2, 'physical', `High bulk density (${n(sp.value)} g/cm³) restricts root growth.`, `الكثافة الظاهرية مرتفعة (${n(sp.value)} غ/سم³) وتعيق نمو الجذور.`); add(ST, 'bd-rip', 2, 'physical', 'Loosen compacted layers by deep ripping when the soil is dry, then add organic matter to keep the structure open.', 'تفكيك الطبقات المتماسكة بالحرث العميق والتربة جافة، ثم إضافة المادة العضوية للحفاظ على بناء مفتوح.'); }
    if (sp.key === 'infil' && sp.cls === 'poor') add(C, 'infil', 3, 'physical', sp.value > 100 ? `Very rapid infiltration (${n(sp.value, 0)} mm/hr): water passes the root zone quickly.` : `Slow infiltration (${n(sp.value, 0)} mm/hr): surface sealing or sodicity is likely.`, sp.value > 100 ? `تسرب سريع جداً (${n(sp.value, 0)} مم/ساعة): يعبر الماء منطقة الجذور بسرعة.` : `تسرب بطيء (${n(sp.value, 0)} مم/ساعة): يُحتمل وجود تصلب سطحي أو صودية.`);
    if ((sp.key === 'resp' || sp.key === 'mbc') && sp.cls === 'poor') add(C, 'bio', 3, 'biological', 'Low biological activity. Regular organic inputs are the main lever for building soil biology in arid sand.', 'النشاط الحيوي منخفض. الإضافات العضوية المنتظمة هي الوسيلة الأساسية لبناء حيوية التربة في الرمال الجافة.');
  }

  // ---------------------------------------------------------------- irrigation water
  if (ctx.water) {
    const w = classifyWater(ctx.water);
    const sev = w.items.filter(i => i.restriction === 'severe');
    if (sev.length) add(C, 'water', 1, 'water', `Irrigation water carries a severe restriction for: ${sev.map(i => i.en.toLowerCase()).join('; ')}. Soil conditions will not improve while this water is used unmanaged.`, `مياه الري عليها قيود شديدة من حيث: ${sev.map(i => i.ar).join('؛ ')}. لن تتحسن حالة التربة ما دامت هذه المياه تُستخدم دون إدارة.`);
    if (ctx.water.ecw !== undefined) {
      const thr = ctx.crop?.a ?? 2.5;
      const lr = leachingRequirement(ctx.water.ecw, thr);
      estimates.push({
        key: 'lr', label: { en: 'Leaching requirement', ar: 'الاحتياج الغسيلي' }, value: lr !== undefined ? `${n(lr * 100, 0)}%` : 'Not achievable',
        note: lr !== undefined
          ? { en: `Extra irrigation water, as a share of crop water use, needed to hold root-zone salinity at the ${ctx.crop ? ctx.crop.en.toLowerCase() : 'reference crop'} threshold (ECe ${thr} dS/m) with water of ${n(ctx.water.ecw)} dS/m.`, ar: `نسبة مياه الري الإضافية من الاستهلاك المائي للمحصول اللازمة لإبقاء ملوحة منطقة الجذور عند حد ${ctx.crop ? ctx.crop.ar : 'المحصول المرجعي'} (ECe ${thr} ديسيسيمنز/م) بمياه ملوحتها ${n(ctx.water.ecw)} ديسيسيمنز/م.` }
          : { en: `Water of ${n(ctx.water.ecw)} dS/m is too saline to hold the root zone at ECe ${thr} dS/m. Choose a more tolerant crop or better water.`, ar: `مياه بملوحة ${n(ctx.water.ecw)} ديسيسيمنز/م أكثر ملوحة من أن تُبقي منطقة الجذور عند ECe ${thr} ديسيسيمنز/م. يُختار محصول أكثر تحملاً أو مياه أفضل.` },
      });
    }
  } else if (saline || sodic) add(ST, 'water-test', 2, 'water', 'Test the irrigation water (EC, SAR, chloride, bicarbonate, boron) and link it to this sample so leaching and amendment rates can be calculated.', 'تحليل مياه الري (EC و SAR والكلوريد والبيكربونات والبورون) وربطه بهذه العينة ليتسنى حساب معدلات الغسيل والمحسّنات.');

  // ---------------------------------------------------------------- crop-specific
  let crop: Bi | undefined;
  if (ctx.crop && ece !== undefined) {
    const ry = relativeYield(ctx.crop, ece);
    if (ry !== undefined) {
      crop = {
        en: `${ctx.crop.en} is ${ctx.crop.tolerance} to salinity: yield starts to decline above ECe ${ctx.crop.a} dS/m and falls by about ${ctx.crop.b}% per dS/m. At the measured ECe of ${n(ece)} dS/m the salinity-limited yield potential is about ${n(ry, 0)}%.`,
        ar: `${ctx.crop.ar}: يبدأ الإنتاج بالانخفاض عند ECe أعلى من ${ctx.crop.a} ديسيسيمنز/م وبنحو ${ctx.crop.b}٪ لكل ديسيسيمنز/م. عند الملوحة المقاسة (${n(ece)} ديسيسيمنز/م) تبلغ الإنتاجية الممكنة المحدودة بالملوحة نحو ${n(ry, 0)}٪.`,
      };
      estimates.push({ key: 'yield', label: { en: `Salinity-limited yield potential, ${ctx.crop.en.toLowerCase()}`, ar: `الإنتاجية الممكنة المحدودة بالملوحة - ${ctx.crop.ar}` }, value: `${n(ry, 0)}%`, note: { en: `Maas-Hoffman model: threshold ${ctx.crop.a} dS/m, slope ${ctx.crop.b}% per dS/m (FAO Irrigation and Drainage Paper 29).`, ar: `نموذج ماس–هوفمان: الحد ${ctx.crop.a} ديسيسيمنز/م، الميل ${ctx.crop.b}٪ لكل ديسيسيمنز/م (منظمة الأغذية والزراعة، ورقة الري والصرف 29).` } });
    } else crop = { en: `${ctx.crop.en} is classed as ${ctx.crop.tolerance} to salinity; no threshold-slope values are tabulated for it.`, ar: `${ctx.crop.ar}: لا تتوفر له قيم جدولية لحد الملوحة والميل.` };
  }

  // ---------------------------------------------------------------- coverage + monitoring
  const minCov = ctx.minCoverage ?? m.minCoverage;
  const missing = res.indicators.filter(i => i.source === 'missing');
  if (res.coverage < minCov && missing.length) add(ST, 'coverage', 2, 'data', `Complete the analysis: ${missing.map(i => INDICATOR_LABEL[i.key]?.en ?? i.key).join(', ')} were not measured, so the score covers only ${n(res.coverage, 0)}% of the scorecard weight.`, `استكمال التحاليل: لم تُقَس ${missing.map(i => INDICATOR_LABEL[i.key]?.ar ?? i.key).join('، ')}، ولذلك تغطي الدرجة ${n(res.coverage, 0)}٪ فقط من وزن بطاقة التقييم.`);
  const poor = res.score !== undefined && res.score < 60;
  monitoring.push(poor || saline || sodic
    ? { en: 'Re-test ECe, SAR and ESP after reclamation and before each planting; repeat the full scorecard analysis once a year.', ar: 'إعادة تحليل ECe و SAR و ESP بعد الاستصلاح وقبل كل زراعة، وتكرار تحليل بطاقة التقييم كاملاً مرة سنوياً.' }
    : { en: 'Repeat the full scorecard analysis once a year, at the same point in the season and from the same sampling locations.', ar: 'تكرار تحليل بطاقة التقييم كاملاً مرة سنوياً في التوقيت نفسه من الموسم ومن مواقع العينات نفسها.' });
  monitoring.push({ en: 'Record GPS coordinates, crop, irrigation source and sampling depth with every sample so results can be compared over time.', ar: 'تسجيل الإحداثيات والمحصول ومصدر الري وعمق العينة مع كل عينة لتتسنى مقارنة النتائج عبر الزمن.' });

  // ---------------------------------------------------------------- ranking
  const lost = (id: string): number => {
    const map: Record<string, string[]> = { sal: ['ece'], sod: ['sar', 'esp'], om: ['om'], ph: ['ph'], cec: ['cec'], n: ['n'], p: ['p'], k: ['k'], ca: ['ca'], mg: ['mg'], s: ['s'], micro: ['fe', 'zn', 'mn', 'cu', 'b'], 'b-high': ['b'] };
    return (map[id] ?? []).reduce((a, k) => { const i = res.byKey[k]; return a + (i?.score !== undefined ? i.weight * (5 - i.score) / 5 : 0); }, 0);
  };
  C.sort((a, b) => a.sev - b.sev || lost(b.id) - lost(a.id));
  ST.sort((a, b) => a.sev - b.sev);
  LT.sort((a, b) => a.sev - b.sev);

  // ---------------------------------------------------------------- crop groups
  const eceTxt = ece !== undefined ? n(ece) : '';
  const G = { vegetables: [] as Bi[], field: [] as Bi[], trees: [] as Bi[] };
  if (eceS !== undefined && ece !== undefined) {
    if (eceS === 5) { G.vegetables.push({ en: 'Salinity does not limit vegetable production.', ar: 'الملوحة لا تحدّ من إنتاج الخضروات.' }); G.field.push({ en: 'Salinity does not limit field crops.', ar: 'الملوحة لا تحدّ من المحاصيل الحقلية.' }); G.trees.push({ en: 'Salinity does not limit fruit trees.', ar: 'الملوحة لا تحدّ من أشجار الفاكهة.' }); }
    else if (eceS === 4) { G.vegetables.push({ en: `At ECe ${eceTxt} dS/m, sensitive vegetables (bean, carrot, onion, strawberry, lettuce) may lose yield; tomato, cucumber and squash are generally unaffected.`, ar: `عند ECe ${eceTxt} ديسيسيمنز/م قد ينخفض إنتاج الخضروات الحساسة (الفاصوليا، الجزر، البصل، الفراولة، الخس)، بينما لا تتأثر الطماطم والخيار والكوسا في الغالب.` }); G.field.push({ en: 'Suitable for most field and forage crops.', ar: 'مناسبة لمعظم المحاصيل الحقلية والعلفية.' }); G.trees.push({ en: 'Suitable for date palm, fig, olive and pomegranate; watch citrus and mango for leaf burn.', ar: 'مناسبة للنخيل والتين والزيتون والرمان، مع مراقبة احتراق الأوراق في الحمضيات والمانجو.' }); }
    else if (eceS === 3) { G.vegetables.push({ en: `At ECe ${eceTxt} dS/m most vegetables lose yield. Prefer the more tolerant ones (zucchini, beetroot, broccoli, tomato) and avoid bean, onion, carrot and strawberry until salinity is lowered.`, ar: `عند ECe ${eceTxt} ديسيسيمنز/م ينخفض إنتاج معظم الخضروات. تُفضَّل الأنواع الأكثر تحملاً (الكوسا، الشمندر، البروكلي، الطماطم) وتُتجنب الفاصوليا والبصل والجزر والفراولة حتى تنخفض الملوحة.` }); G.field.push({ en: 'Barley, wheat and sorghum tolerate this level; maize and alfalfa lose yield.', ar: 'الشعير والقمح والذرة الرفيعة تتحمل هذا المستوى، بينما ينخفض إنتاج الذرة والبرسيم.' }); G.trees.push({ en: 'Date palm tolerates this level with little loss; citrus, grape and mango are not suitable without leaching.', ar: 'يتحمل النخيل هذا المستوى بفقد بسيط، أما الحمضيات والعنب والمانجو فلا تناسبها دون غسيل.' }); }
    else { G.vegetables.push({ en: `At ECe ${eceTxt} dS/m vegetable production is not advisable until the soil is leached.`, ar: `عند ECe ${eceTxt} ديسيسيمنز/م لا يُنصح بزراعة الخضروات قبل غسيل التربة.` }); G.field.push({ en: eceS === 2 ? 'Only salt-tolerant crops such as barley and salt-tolerant forages are suitable.' : 'Only halophytic or highly salt-tolerant forages are suitable until the soil is reclaimed.', ar: eceS === 2 ? 'لا يناسب سوى المحاصيل المتحملة للملوحة كالشعير والأعلاف المتحملة.' : 'لا يناسب سوى النباتات الملحية أو الأعلاف شديدة التحمل إلى حين استصلاح التربة.' }); G.trees.push({ en: eceS === 2 ? 'Date palm survives but yields are reduced; do not plant other fruit trees before reclamation.' : 'Not suitable for fruit trees, including date palm, before reclamation.', ar: eceS === 2 ? 'يعيش النخيل لكن بإنتاج منخفض؛ لا تُزرع أشجار الفاكهة الأخرى قبل الاستصلاح.' : 'غير مناسبة لأشجار الفاكهة، ومنها النخيل، قبل الاستصلاح.' }); }
  }
  if (sodic) { const t: Bi = { en: 'Apply gypsum to the root zone and keep the surface from crusting.', ar: 'إضافة الجبس الزراعي لمنطقة الجذور ومنع تكوّن القشرة السطحية.' }; G.vegetables.push(t); G.field.push({ en: 'Gypsum before planting improves emergence and infiltration.', ar: 'إضافة الجبس قبل الزراعة تحسّن الإنبات والنفاذية.' }); G.trees.push({ en: 'Apply gypsum in the tree basin and irrigate it in; repeat each year while sodium is elevated.', ar: 'إضافة الجبس في حوض الشجرة وريّه، وتكرار ذلك سنوياً ما دام الصوديوم مرتفعاً.' }); }
  if (omS !== undefined && omS <= 3) { G.vegetables.push({ en: 'Incorporate compost into the beds before every crop.', ar: 'خلط الكمبوست في المصاطب قبل كل محصول.' }); G.field.push({ en: 'Use green manure or legume rotations and return residues.', ar: 'استخدام السماد الأخضر أو الدورات البقولية وإعادة البقايا للتربة.' }); G.trees.push({ en: 'Apply compost and mulch in the basin under the canopy every year.', ar: 'إضافة الكمبوست والتغطية في الحوض تحت ظل الشجرة سنوياً.' }); }
  if (defs.length) { const e = list(defs.map(k => el[k].en), 'and'), a = list(defs.map(k => el[k].ar), 'و'); G.vegetables.push({ en: `Foliar ${e} from the 4-leaf stage, repeated through the season.`, ar: `رش ورقي بـ${a} من مرحلة الأوراق الأربع وتكراره خلال الموسم.` }); G.field.push({ en: `Correct ${e} by seed-row banding or one to two foliar sprays at tillering.`, ar: `معالجة نقص ${a} بالتسطير مع البذور أو برشة إلى رشتين عند التفريع.` }); G.trees.push({ en: `Supply ${e} as chelates in the basin at the start of each growth flush, with foliar sprays on new leaves.`, ar: `إضافة ${a} في صورة مخلبية في الحوض عند بداية كل دفعة نمو، مع الرش الورقي على الأوراق الحديثة.` }); }
  if (cecS !== undefined && cecS <= 3) { G.vegetables.push({ en: 'Fertigate daily to weekly in small doses.', ar: 'التسميد مع الري بجرعات صغيرة يومياً إلى أسبوعياً.' }); G.field.push({ en: 'Split nitrogen and potassium into at least three applications.', ar: 'تقسيم النيتروجين والبوتاسيوم على ثلاث دفعات على الأقل.' }); G.trees.push({ en: 'Divide the annual fertiliser programme into monthly doses during active growth.', ar: 'توزيع البرنامج السمادي السنوي على جرعات شهرية خلال فترة النمو النشط.' }); }
  if (bHigh && bV !== undefined && bV > 2) { G.vegetables.push({ en: 'Boron-sensitive crops (bean, onion, strawberry) are at risk.', ar: 'المحاصيل الحساسة للبورون (الفاصوليا، البصل، الفراولة) معرّضة للخطر.' }); G.trees.push({ en: 'Citrus, grape and fig are boron-sensitive; date palm is tolerant.', ar: 'الحمضيات والعنب والتين حساسة للبورون، والنخيل متحمل له.' }); }
  const none: Bi = { en: 'No specific limitation identified; maintain a balanced fertigation programme based on crop demand.', ar: 'لا توجد قيود محددة؛ يُحافظ على برنامج تسميد متوازن وفق احتياج المحصول.' };
  const join = (xs: Bi[]): Bi => (xs.length ? { en: xs.map(x => x.en).join(' '), ar: xs.map(x => x.ar).join(' ') } : none);

  // ---------------------------------------------------------------- overall
  const rating = m.ratings.find(r => r.key === res.rating);
  const top = C.filter(c => c.sev <= 2).slice(0, 3);
  const topicName: Record<string, Bi> = {
    salinity: { en: 'salinity', ar: 'الملوحة' }, sodicity: { en: 'sodium', ar: 'الصودية' }, organic: { en: 'low organic matter', ar: 'انخفاض المادة العضوية' },
    ph: { en: 'alkalinity', ar: 'القلوية' }, retention: { en: 'low nutrient retention', ar: 'ضعف الاحتفاظ بالعناصر' }, nutrients: { en: 'macronutrient supply', ar: 'إمداد العناصر الكبرى' },
    micronutrients: { en: 'micronutrient status', ar: 'حالة العناصر الصغرى' }, physical: { en: 'physical condition', ar: 'الحالة الفيزيائية' }, biological: { en: 'biological activity', ar: 'النشاط الحيوي' }, water: { en: 'irrigation water quality', ar: 'نوعية مياه الري' }, data: { en: 'data quality', ar: 'جودة البيانات' },
  };
  const topics = [...new Set(top.map(t => t.topic))];
  let overall: Bi;
  if (res.score === undefined || !rating) overall = { en: 'No scorecard indicators have been measured yet, so the soil cannot be rated.', ar: 'لم تُقَس أي من مؤشرات بطاقة التقييم بعد، ولذلك لا يمكن تصنيف التربة.' };
  else {
    const tex = ctx.texture ? `${ctx.texture} soil. ` : '';
    const texAr = ctx.texture ? `قوام التربة: ${ctx.texture}. ` : '';
    overall = {
      en: `${tex}Soil health score ${n(res.score, 1)} out of 100, rated ${rating.en}: ${rating.meaning.toLowerCase()}. ` +
        (topics.length ? `The main limiting factors are ${list(topics.map(t => topicName[t]?.en ?? t), 'and')}. ` : 'No major limiting factor was identified. ') +
        (strengths.length ? `Strengths: ${strengths.slice(0, 3).map(x => x.en.charAt(0).toLowerCase() + x.en.slice(1)).join('; ')}. ` : '') +
        (res.coverage < minCov ? `The score is based on ${n(res.coverage, 0)}% of the scorecard weight and should be read with caution.` : `The score covers ${n(res.coverage, 0)}% of the scorecard weight.`),
      ar: `${texAr}درجة صحة التربة ${n(res.score, 1)} من 100، والتصنيف: ${rating.ar} (${rating.meaningAr}). ` +
        (topics.length ? `العوامل المحدِّدة الرئيسية: ${list(topics.map(t => topicName[t]?.ar ?? t), 'و')}. ` : 'لم يُحدَّد عامل مقيِّد رئيسي. ') +
        (strengths.length ? `نقاط القوة: ${strengths.slice(0, 3).map(x => x.ar).join('؛ ')}. ` : '') +
        (res.coverage < minCov ? `تستند الدرجة إلى ${n(res.coverage, 0)}٪ من وزن بطاقة التقييم ويجب قراءتها بحذر.` : `تغطي الدرجة ${n(res.coverage, 0)}٪ من وزن بطاقة التقييم.`),
    };
  }
  return { overall, constraints: C, strengths, groups: { vegetables: join(G.vegetables), field: join(G.field), trees: join(G.trees) }, crop, shortTerm: ST, longTerm: LT, estimates, monitoring };
}
