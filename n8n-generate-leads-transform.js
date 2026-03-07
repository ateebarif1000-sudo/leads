/**
 * n8n Code node: transform webhook body into API request body.
 * Put this node AFTER the Webhook (generate_leads) and BEFORE the HTTP Request.
 *
 * Input: webhook body with industry, country, city, maxResults, companySize, keywords, jobTitle, emailAvailable, phoneAvailable
 * Output: one item with json.body ready for the API (arrays for job_titles, industries, etc., split by comma).
 */

function splitAndTrim(str) {
  if (str == null || str === '') return [];
  return String(str)
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

function firstOrEmpty(arr) {
  return Array.isArray(arr) && arr.length > 0 ? arr[0] : '';
}

const raw = $input.first().json;
const body = raw.body || raw;

const industry = body.industry != null ? String(body.industry).trim() : '';
const country = body.country != null ? String(body.country).trim() : '';
const city = body.city != null ? String(body.city).trim() : '';
const maxResults = Math.max(1, parseInt(body.maxResults, 10) || 5);
const companySize = body.companySize != null ? String(body.companySize).trim() : '';
const keywords = body.keywords != null ? String(body.keywords).trim() : '';
const jobTitle = body.jobTitle != null ? String(body.jobTitle).trim() : '';
const emailAvailable = !!body.emailAvailable;
const phoneAvailable = !!body.phoneAvailable;

// Build arrays: split comma-separated values (e.g. "CEO, Title Officer" → ["CEO", "Title Officer"], "real estate, closing" → ["real estate", "closing"])
const industries = industry ? splitAndTrim(industry) : [];
const person_location_country = country ? splitAndTrim(country) : [];
const person_location_locality = city ? splitAndTrim(city) : [];
const job_titles = jobTitle ? splitAndTrim(jobTitle) : [];
const industry_keywords = keywords ? splitAndTrim(keywords) : [];
// companySize often comes as "1-10" or "11-50" — single value, but API may want array
const employee_size = companySize ? [companySize] : [];

// Some APIs expect "industry_keywords", others "keywords" — we send both (same array) so you can use either in the HTTP Request
const apiBody = {
  employee_size: employee_size,
  include_emails: emailAvailable,
  include_phones: phoneAvailable,
  industries: industries.length ? industries : [],
  industry_keywords: industry_keywords,
  keywords: industry_keywords,
  job_titles: job_titles,
  person_location_country: person_location_country,
  person_location_locality: person_location_locality,
  max_results: maxResults
};

return [{ json: { body: apiBody } }];
