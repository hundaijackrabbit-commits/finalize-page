function list(value){ return Array.isArray(value) ? value.filter(Boolean) : []; }
function entitiesOf(profile){ return profile?.entities || profile?.entities_json || {}; }
function typeOf(profile){ return profile?.documentType || profile?.document_type || 'GENERIC'; }
function artifactIdOf(profile){ return profile?.artifactId || profile?.artifact_id || null; }
function normalizeEntity(value=''){ return String(value).toLowerCase().replace(/\b(incorporated|inc|limited|ltd|corporation|corp|llc|llp|lp)\.?\b/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }

export function analyzePackageProfiles(profiles=[]){
  const usable=list(profiles).filter(Boolean); const observations=[];
  const currencyRows=usable.map(p=>({artifactId:artifactIdOf(p),type:typeOf(p),currencies:list(entitiesOf(p).currencies)})).filter(r=>r.currencies.length===1);
  const distinctCurrencies=[...new Set(currencyRows.map(r=>r.currencies[0]))];
  if(currencyRows.length>=2 && distinctCurrencies.length>1){
    observations.push({key:'package_currency_variance',severity:'WARNING',title:'Currencies vary across the document package',detail:`Documents use ${distinctCurrencies.join(', ')}. Confirm the package intentionally mixes currencies.`,evidence:{currencies:distinctCurrencies,artifacts:currencyRows}});
  }
  const related=usable.filter(p=>['CONTRACT','PROPOSAL','APPLICATION'].includes(typeOf(p))).map(p=>({artifactId:artifactIdOf(p),type:typeOf(p),entities:list(entitiesOf(p).legalEntities).map(normalizeEntity).filter(Boolean)})).filter(r=>r.entities.length);
  if(related.length>=2){
    const common=related[0].entities.filter(e=>related.slice(1).some(r=>r.entities.includes(e)));
    if(!common.length){
      observations.push({key:'package_entity_variance',severity:'WARNING',title:'Party or organization names vary across related documents',detail:'Finalize could not find a normalized legal-entity name shared across the related contract/proposal/application documents. Confirm the package refers to the intended organizations.',evidence:{artifacts:related}});
    }
  }
  return observations;
}
