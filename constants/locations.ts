/**
 * Shared location constants for country and region selection
 * Used by: Profile.tsx, CreateClub.tsx, CreateCompetition.tsx
 */

export interface Country {
  code: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: 'NZL', name: 'New Zealand' },
  { code: 'AUS', name: 'Australia' },
  { code: 'USA', name: 'United States' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'CAN', name: 'Canada' },
  { code: 'FRA', name: 'France' },
  { code: 'DEU', name: 'Germany' },
  { code: 'JPN', name: 'Japan' },
  { code: 'CHN', name: 'China' },
  { code: 'IND', name: 'India' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'ITA', name: 'Italy' },
  { code: 'ESP', name: 'Spain' },
  { code: 'NLD', name: 'Netherlands' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'KOR', name: 'South Korea' },
  { code: 'ZAF', name: 'South Africa' },
  { code: 'MEX', name: 'Mexico' },
].sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_REGIONS: Record<string, string[]> = {
  NZL: [
    "Northland", "Auckland", "Waikato", "Bay of Plenty", "Gisborne", 
    "Hawke's Bay", "Taranaki", "Manawatū-Whanganui", "Wellington", 
    "Tasman", "Nelson", "Marlborough", "West Coast", "Canterbury", 
    "Otago", "Southland"
  ],
  AUS: [
    "New South Wales", "Victoria", "Queensland", "Western Australia", 
    "South Australia", "Tasmania", "Australian Capital Territory", 
    "Northern Territory"
  ],
  USA: [
    "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", 
    "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", 
    "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", 
    "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", 
    "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", 
    "New Hampshire", "New Jersey", "New Mexico", "New York", 
    "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", 
    "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", 
    "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", 
    "West Virginia", "Wisconsin", "Wyoming", "District of Columbia"
  ],
  GBR: ["England", "Scotland", "Wales", "Northern Ireland"],
  CAN: [
    "Alberta", "British Columbia", "Manitoba", "New Brunswick", 
    "Newfoundland and Labrador", "Nova Scotia", "Ontario", 
    "Prince Edward Island", "Quebec", "Saskatchewan", 
    "Northwest Territories", "Nunavut", "Yukon"
  ],
  FRA: [
    "Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Brittany", 
    "Centre-Val de Loire", "Corsica", "Grand Est", "Hauts-de-France", 
    "Île-de-France", "Normandy", "Nouvelle-Aquitaine", "Occitanie", 
    "Pays de la Loire", "Provence-Alpes-Côte d'Azur"
  ],
  DEU: [
    "Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen", 
    "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern", 
    "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", 
    "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"
  ],
  JPN: [
    "Hokkaido", "Tohoku", "Kanto", "Chubu", "Kansai", 
    "Chugoku", "Shikoku", "Kyushu", "Okinawa"
  ],
  CHN: [
    "Anhui", "Beijing", "Chongqing", "Fujian", "Gansu", "Guangdong", 
    "Guangxi", "Guizhou", "Hainan", "Hebei", "Heilongjiang", "Henan", 
    "Hubei", "Hunan", "Inner Mongolia", "Jiangsu", "Jiangxi", "Jilin", 
    "Liaoning", "Ningxia", "Qinghai", "Shaanxi", "Shandong", "Shanghai", 
    "Shanxi", "Sichuan", "Tianjin", "Tibet", "Xinjiang", "Yunnan", "Zhejiang"
  ],
  IND: [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", 
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", 
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", 
    "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", 
    "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", 
    "West Bengal"
  ],
  BRA: [
    "Acre", "Alagoas", "Amapá", "Amazonas", "Bahia", "Ceará", 
    "Distrito Federal", "Espírito Santo", "Goiás", "Maranhão", 
    "Mato Grosso", "Mato Grosso do Sul", "Minas Gerais", "Pará", 
    "Paraíba", "Paraná", "Pernambuco", "Piauí", "Rio de Janeiro", 
    "Rio Grande do Norte", "Rio Grande do Sul", "Rondônia", "Roraima", 
    "Santa Catarina", "São Paulo", "Sergipe", "Tocantins"
  ],
  ITA: [
    "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna", 
    "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardy", "Marche", 
    "Molise", "Piedmont", "Apulia", "Sardinia", "Sicily", "Tuscany", 
    "Trentino-Alto Adige/Südtirol", "Umbria", "Valle d'Aosta", "Veneto"
  ],
  ESP: [
    "Andalusia", "Aragon", "Asturias", "Balearic Islands", "Basque Country", 
    "Canary Islands", "Cantabria", "Castile and León", "Castilla-La Mancha", 
    "Catalonia", "Extremadura", "Galicia", "La Rioja", "Madrid", "Murcia", 
    "Navarre", "Valencia"
  ],
  NLD: [
    "Drenthe", "Flevoland", "Friesland", "Gelderland", "Groningen", 
    "Limburg", "North Brabant", "North Holland", "Overijssel", 
    "South Holland", "Utrecht", "Zeeland"
  ],
  SWE: [
    "Blekinge", "Dalarna", "Gävleborg", "Gotland", "Halland", "Jämtland", 
    "Jönköping", "Kalmar", "Kronoberg", "Norrbotten", "Örebro", 
    "Östergötland", "Skåne", "Södermanland", "Stockholm", "Uppsala", 
    "Värmland", "Västerbotten", "Västernorrland", "Västmanland", 
    "Västra Götaland"
  ],
  KOR: [
    "Seoul", "Busan", "Daegu", "Incheon", "Gwangju", "Daejeon", "Ulsan", 
    "Sejong", "Gyeonggi", "Gangwon", "North Chungcheong", "South Chungcheong", 
    "North Jeolla", "South Jeolla", "North Gyeongsang", "South Gyeongsang", "Jeju"
  ],
  ZAF: [
    "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", 
    "Mpumalanga", "Northern Cape", "North West", "Western Cape"
  ],
  MEX: [
    "Aguascalientes", "Baja California", "Baja California Sur", "Campeche", 
    "Chiapas", "Chihuahua", "Coahuila", "Colima", "Durango", "Guanajuato", 
    "Guerrero", "Hidalgo", "Jalisco", "México", "Mexico City", "Michoacán", 
    "Morelos", "Nayarit", "Nuevo León", "Oaxaca", "Puebla", "Querétaro", 
    "Quintana Roo", "San Luis Potosí", "Sinaloa", "Sonora", "Tabasco", 
    "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatán", "Zacatecas"
  ],
};

/**
 * Helper function to get regions for a country code
 */
export const getRegionsForCountry = (countryCode: string): string[] => {
  return COUNTRY_REGIONS[countryCode] || [];
};

/**
 * Helper function to get country name from code
 */
export const getCountryName = (countryCode: string): string => {
  const country = COUNTRIES.find(c => c.code === countryCode);
  return country?.name || countryCode;
};