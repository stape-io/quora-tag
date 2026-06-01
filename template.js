const decodeUriComponent = require('decodeUriComponent');
const getAllEventData = require('getAllEventData');
const getCookieValues = require('getCookieValues');
const getRequestHeader = require('getRequestHeader');
const getTimestampMillis = require('getTimestampMillis');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeNumber = require('makeNumber');
const parseUrl = require('parseUrl');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();

if (!isConsentGivenOrNotRequired(data, eventData)) {
  return data.gtmOnSuccess();
}

const apiVersion = '0';
const postUrl = 'https://api.quora.com/ads/v' + apiVersion + '/conversion';
const eventType = getEventName(eventData, data);
const eventName =
  eventType.tracking_type === 'Custom' ? eventType.custom_event_name : eventType.tracking_type;
const url = eventData.page_location || getRequestHeader('referer');
let qclid = getCookieValues('qclid')[0] || eventData.qclid;

if (url) {
  const urlParsed = parseUrl(url);

  if (urlParsed && urlParsed.searchParams.qclid) {
    qclid = decodeUriComponent(urlParsed.searchParams.qclid);
  }
}

const postBody = mapEvent(eventData, data);

if (qclid) {
  setCookie('qclid', qclid, {
    domain: 'auto',
    path: '/',
    samesite: 'Lax',
    secure: true,
    'max-age': 2592000, // 30 days
    httpOnly: false
  });
}

if (checkRequiredParams(postBody)) {
  return data.gtmOnFailure();
}

sendHttpRequest(
  postUrl,
  (statusCode, headers, body) => {
    if (!data.useOptimisticScenario) {
      if (statusCode >= 200 && statusCode < 400) {
        data.gtmOnSuccess();
      } else {
        data.gtmOnFailure();
      }
    }
  },
  {
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + data.accessToken
    },
    method: 'POST'
  },
  JSON.stringify(postBody)
);

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}

/*==============================================================================
Vendor related functions
==============================================================================*/

function mapEvent(eventData, data) {
  let mappedData = {
    account_id: data.accountId,
    conversion: {
      event_name: eventName
    },
    user: {},
    device: {}
  };

  mappedData = addConversionData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addDeviceData(eventData, mappedData);

  return mappedData;
}

function addConversionData(eventData, mappedData) {
  const timestamp = eventData.timestamp || getTimestampMillis();
  if (timestamp) mappedData.conversion.timestamp = timestamp * 1000;

  if (eventData.event_id) mappedData.conversion.event_id = eventData.event_id;
  if (eventData.value) mappedData.value = makeNumber(eventData.value);

  if (qclid) {
    mappedData.conversion.click_id = qclid;
  }

  if (data.conversionDataList) {
    data.conversionDataList.forEach((d) => {
      mappedData.conversion[d.name] = d.value;
    });
  }
  return mappedData;
}

function addDeviceData(eventData, mappedData) {
  if (eventData.mobile_device_id) mappedData.device.mobile_device_id = eventData.mobile_device_id;
  if (eventData.page_referrer) mappedData.device.referrer = eventData.page_referrer;
  if (eventData.user_agent) mappedData.device.client_user_agent = eventData.user_agent;
  if (eventData.language) mappedData.device.language = eventData.language;
  if (data.deviceEventDataList) {
    data.deviceEventDataList.forEach((d) => {
      mappedData.device[d.name] = d.value;
    });
  }

  return mappedData;
}

function addUserData(eventData, mappedData) {
  let user_data = {};
  let address = {};
  let first_name = '';
  let last_name = '';

  if (getType(eventData.user_data) === 'object') {
    user_data = eventData.user_data || eventData.user_properties || eventData.user;
    const addressType = getType(user_data.address);
    if (addressType === 'object' || addressType === 'array') {
      address = user_data.address[0] || user_data.address;
    }
  }

  const email =
    eventData.email || eventData.email_address || user_data.email || user_data.email_address;
  if (email) mappedData.user.email = email;

  const ip = eventData.ip_override || eventData.ip_address || eventData.ip;
  if (ip) mappedData.user.ip = ip;

  const lastName =
    eventData.lastName ||
    eventData.LastName ||
    eventData.nameLast ||
    eventData.last_name ||
    user_data.last_name ||
    address.last_name ||
    '';

  const firstName =
    eventData.firstName ||
    eventData.FirstName ||
    eventData.nameFirst ||
    eventData.first_name ||
    user_data.first_name ||
    address.first_name ||
    '';

  if ((firstName + lastName).length >= 1) {
    mappedData.user.name = (firstName + ' ' + lastName).trim();
  }

  const phone = eventData.phone || user_data.phone_number;
  if (phone) mappedData.user.phone_number = phone;

  const countryCode =
    eventData.countryCode || eventData.country || user_data.country || address.country;
  if (countryCode) mappedData.user.country = countryCode;

  const state = eventData.state || eventData.region || user_data.region || address.region;
  if (state) mappedData.user.region = state;

  const zip =
    eventData.zip || eventData.postal_code || user_data.postal_code || address.postal_code;
  if (zip) mappedData.user.postal_code = zip;

  const city = eventData.city || address.city;
  if (city) mappedData.user.city = city;

  if (eventData.company_name) mappedData.user.company_name = eventData.company_name;

  if (eventData.job_title) mappedData.user.job_title = eventData.job_title;

  if (eventData.date_of_birth) mappedData.user.date_of_birth = eventData.date_of_birth;

  if (data.userDataList) {
    data.userDataList.forEach((d) => {
      mappedData.user[d.name] = d.value;
    });
  }

  return mappedData;
}

function getEventName(eventData, data) {
  if (data.eventType === 'inherit') {
    let eventName = eventData.event_name;

    let gaToEventName = {
      page_view: 'Generic',
      click: 'Generic',
      download: 'Generic',
      file_download: 'Generic',
      complete_registration: 'CompleteRegistration',
      'gtm.dom': 'Generic',
      add_payment_info: 'AddPaymentInfo',
      add_to_cart: 'AddToCart',
      add_to_wishlist: 'AddToWishlist',
      sign_up: 'CompleteRegistration',
      begin_checkout: 'InitiateCheckout',
      generate_lead: 'GenerateLead',
      purchase: 'Purchase',
      search: 'Search',
      view_item: 'ViewContent',

      contact: 'GenerateLead',
      find_location: 'Search',
      submit_application: 'GenerateLead',
      subscribe: 'GenerateLead',

      'gtm4wp.addProductToCartEEC': 'AddToCart',
      'gtm4wp.productClickEEC': 'Generic',
      'gtm4wp.checkoutOptionEEC': 'InitiateCheckout',
      'gtm4wp.checkoutStepEEC': 'AddPaymentInfo',
      'gtm4wp.orderCompletedEEC': 'Purchase'
    };

    if (!gaToEventName[eventName]) {
      return {
        tracking_type: 'Custom',
        custom_event_name: eventName
      };
    }

    return {
      tracking_type: gaToEventName[eventName]
    };
  }

  return {
    tracking_type: data.eventName
  };
}

function checkRequiredParams(postBody) {
  let failed = false;
  let error = '';
  let required = [
    'account_id',
    'conversion.event_name',
    'conversion.event_id',
    'conversion.click_id'
  ];

  required.forEach((item) => {
    let value = postBody;
    item.split('.').forEach((key) => {
      if (value && value[key]) {
        value = value[key];
      } else {
        value = undefined;
      }
    });
    if (!value) {
      error += ' ' + item.split('.').slice(-1);
      failed = true;
    }
  });

  if (failed) {
    log({
      Name: 'Quora',
      Type: 'Message',
      EventName: eventName,
      Error: '🛑 [ERROR] Missing params: ' + error,
      Body: postBody
    });
  }

  return failed;
}

/*==============================================================================
Helpers
==============================================================================*/

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  rawDataToLog.TraceId = getRequestHeader('trace-id');
  logToConsole(JSON.stringify(rawDataToLog));
}
