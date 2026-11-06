// Land → continent. Een locatie zoals "Nantes, France" wordt gekoppeld via het laatste deel na de komma.
// Rusland en Turkije tellen als Azië (grootste deel van het land).

export const CONTINENTS = {
  EU: 'Europa',
  AS: 'Azië',
  AF: 'Afrika',
  NA: 'Noord-Amerika',
  SA: 'Zuid-Amerika',
  OC: 'Oceanië',
};

const LIST = {
  EU: `Albania; Andorra; Austria; Belarus; Belgium; Bosnia and Herzegovina; Bosnia and Herz.; Bosnia; Bulgaria; Croatia;
    Czechia; Czech Republic; Czech Rep.; Denmark; Estonia; Finland; France; Germany; Greece; Hungary; Iceland; Ireland;
    Italy; Kosovo; Latvia; Liechtenstein; Lithuania; Luxembourg; Malta; Moldova; Monaco; Montenegro; Netherlands;
    The Netherlands; Holland; North Macedonia; Macedonia; Norway; Poland; Portugal; Romania; San Marino; Serbia;
    Slovakia; Slovenia; Spain; Sweden; Switzerland; Ukraine; United Kingdom; UK; U.K.; Great Britain; England;
    Scotland; Wales; Northern Ireland; Vatican City; Vatican; Faroe Islands; Faeroe Is.; Gibraltar; Isle of Man; Jersey; Guernsey;
    Åland; Svalbard`,
  AS: `Russia; Russian Federation; Turkey; Türkiye; Turkiye; Afghanistan; Armenia; Azerbaijan; Bahrain; Bangladesh;
    Bhutan; Brunei; Cambodia; China; Cyprus; N. Cyprus; Northern Cyprus; Georgia; Hong Kong; India; Indonesia; Iran;
    Iraq; Israel; Japan; Jordan; Kazakhstan; Kuwait; Kyrgyzstan; Laos; Lebanon; Macau; Macao; Malaysia; Maldives;
    Mongolia; Myanmar; Burma; Nepal; North Korea; Oman; Pakistan; Palestine; West Bank; Gaza; Philippines; Qatar;
    Saudi Arabia; Singapore; South Korea; Korea; Republic of Korea; Sri Lanka; Syria; Taiwan; Tajikistan; Thailand;
    Timor-Leste; East Timor; Turkmenistan; United Arab Emirates; UAE; U.A.E.; Uzbekistan; Siachen Glacier; Vietnam; Viet Nam; Yemen`,
  AF: `Algeria; Angola; Benin; Botswana; Burkina Faso; Burundi; Cabo Verde; Cape Verde; Cameroon;
    Central African Republic; Central African Rep.; CAR; Chad; Comoros; Congo; Republic of the Congo;
    Congo-Brazzaville; DR Congo; D.R. Congo; DRC; Democratic Republic of the Congo; Dem. Rep. Congo; Congo-Kinshasa;
    Djibouti; Egypt; Equatorial Guinea; Eq. Guinea; Eritrea; Eswatini; eSwatini; Swaziland; Ethiopia; Gabon; Gambia;
    The Gambia; Ghana; Guinea; Guinea-Bissau; Ivory Coast; Côte d'Ivoire; Cote d'Ivoire; Kenya; Lesotho; Liberia;
    Libya; Madagascar; Malawi; Mali; Mauritania; Mauritius; Morocco; Mozambique; Namibia; Niger; Nigeria; Rwanda;
    São Tomé and Príncipe; Sao Tome and Principe; Senegal; Seychelles; Sierra Leone; Somalia; Somaliland;
    South Africa; South Sudan; S. Sudan; Sudan; Tanzania; Togo; Tunisia; Uganda; Western Sahara; W. Sahara; Zambia;
    Zimbabwe; Réunion; Reunion; Mayotte; Saint Helena`,
  NA: `USA; U.S.A.; US; U.S.; United States; United States of America; Canada; Mexico; Greenland; Belize; Costa Rica;
    El Salvador; Guatemala; Honduras; Nicaragua; Panama; Antigua and Barbuda; Bahamas; The Bahamas; Barbados; Cuba;
    Dominica; Dominican Republic; Dominican Rep.; Grenada; Haiti; Jamaica; Saint Kitts and Nevis;
    St. Kitts and Nevis; Saint Lucia; St. Lucia; Saint Vincent and the Grenadines; St. Vincent and the Grenadines;
    Trinidad and Tobago; Puerto Rico; Bermuda; Aruba; Curaçao; Curacao; Sint Maarten; Cayman Islands;
    US Virgin Islands; U.S. Virgin Islands; British Virgin Islands; Turks and Caicos Islands; Guadeloupe; Martinique;
    Bonaire; Anguilla; Montserrat; Saint Pierre and Miquelon`,
  SA: `Argentina; Bolivia; Brazil; Chile; Colombia; Ecuador; Guyana; Paraguay; Peru; Suriname; Uruguay; Venezuela;
    French Guiana; Falkland Islands; Falkland Is.`,
  OC: `Australia; New Zealand; Fiji; Papua New Guinea; Solomon Islands; Solomon Is.; Vanuatu; Samoa; Tonga; Kiribati;
    Tuvalu; Nauru; Palau; Micronesia; Marshall Islands; New Caledonia; French Polynesia; Tahiti; Guam;
    Northern Mariana Islands; American Samoa; Cook Islands; Niue; Wallis and Futuna`,
};

export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const LOOKUP = new Map();
for (const [code, names] of Object.entries(LIST)) {
  for (const n of names.split(';')) if (n.trim()) LOOKUP.set(norm(n), code);
}

export const continentOfCountry = (country) => LOOKUP.get(norm(country)) ?? null;

// "Port Hedland, Western Australia, Australia" → OC. "Singapore" → AS.
export function continentOf(location) {
  const parts = String(location ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = continentOfCountry(parts[i]);
    if (c) return c;
  }
  return null;
}
