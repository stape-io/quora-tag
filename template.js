const getAllEventData = require('getAllEventData');
const JSON = require('JSON');
const sendHttpRequest = require('sendHttpRequest');
const setCookie = require('setCookie');
const getCookieValues = require('getCookieValues');
const getContainerVersion = require('getContainerVersion');
const logToConsole = require('logToConsole');
const getRequestHeader = require('getRequestHeader');
const parseUrl = require('parseUrl');
const decodeUriComponent = require('decodeUriComponent');
const getType = require('getType');
const getTimestampMillis = require('getTimestampMillis');
const makeNumber = require('makeNumber');
const encodeUriComponent = require('encodeUriComponent');

const isLoggingEnabled = determinateIsLoggingEnabled();
const traceId = isLoggingEnabled ? getRequestHeader('trace-id') : undefined;

const eventData = getAllEventData();

const apiVersion = '0';
const postUrl = 'https://api.quora.com/ads/v' + apiVersion + '/conversion';
const eventType = getEventName(eventData, data);
const eventName =
  eventType.tracking_type === 'Custom'
    ? eventType.custom_event_name
    : eventType.tracking_type;
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
    httpOnly: false,
  });
}

if (checkRequiredParams(postBody)) {
  return data.gtmOnFailure();
}

log({
  Name: 'Quora',
  Type: 'Request',
  TraceId: traceId,
  EventName: eventName,
  RequestMethod: 'POST',
  RequestUrl: postUrl,
  RequestBody: postBody,
});

sendHttpRequest(
  postUrl,
  (statusCode, headers, body) => {
    log({
      Name: 'Quora',
      Type: 'Response',
      TraceId: traceId,
      EventName: eventName,
      ResponseStatusCode: statusCode,
      ResponseHeaders: headers,
      ResponseBody: body,
    });

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
      Authorization: 'Bearer ' + data.accessToken,
    },
    method: 'POST',
  },
  JSON.stringify(postBody),
);

if (data.useOptimisticScenario) {
  data.gtmOnSuccess();
}

function mapEvent(eventData, data) {
  let mappedData = {
    account_id: data.accountId,
    conversion: {
      event_name: eventName,
    },
    user: {},
    device: {},
  };

  mappedData = addConversionData(eventData, mappedData);
  mappedData = addUserData(eventData, mappedData);
  mappedData = addDeviceData(eventData, mappedData);

  return mappedData;
}

function addConversionData(evenData, mappedData) {
  if (eventData.timestamp)
    mappedData.conversion.timestamp = eventData.timestamp * 1000;
  else mappedData.conversion.timestamp = getTimestampMillis() * 1000;

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
  if (eventData.mobile_device_id)
    mappedData.device.mobile_device_id = eventData.mobile_device_id;
  if (eventData.page_referrer)
    mappedData.device.referrer = eventData.page_referrer;
  if (eventData.user_agent)
    mappedData.device.client_user_agent = eventData.user_agent;
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
    user_data =
      eventData.user_data || eventData.user_properties || eventData.user;
    const addressType = getType(user_data.address);
    if (addressType === 'object' || addressType === 'array') {
      address = user_data.address[0] || user_data.address;
    }
  }

  if (eventData.email) mappedData.user.email = eventData.email;
  else if (eventData.email_address)
    mappedData.user.email = eventData.email_address;
  else if (user_data.email) mappedData.user.email = user_data.email;
  else if (user_data.email_address)
    mappedData.user.email = user_data.email_address;

  if (eventData.ip_override) mappedData.user.ip = eventData.ip_override;
  else if (eventData.ip_address) mappedData.user.ip = eventData.ip_address;
  else if (eventData.ip) mappedData.user.ip = eventData.ip;

  if (eventData.lastName) last_name = eventData.lastName;
  else if (eventData.LastName) last_name = eventData.LastName;
  else if (eventData.nameLast) last_name = eventData.nameLast;
  else if (eventData.last_name) last_name = eventData.last_name;
  else if (user_data.last_name) last_name = user_data.last_name;
  else if (address.first_name) last_name = address.first_name;

  if (eventData.firstName) first_name = eventData.firstName;
  else if (eventData.FirstName) first_name = eventData.FirstName;
  else if (eventData.nameFirst) first_name = eventData.nameFirst;
  else if (eventData.first_name) first_name = eventData.first_name;
  else if (user_data.first_name) first_name = user_data.first_name;
  else if (address.first_name) first_name = address.first_name;

  if ((first_name + last_name).length >= 1) {
    mappedData.user.name = (first_name + ' ' + last_name).trim();
  }
  if (eventData.phone) mappedData.user.phone_number = eventData.phone;
  else if (user_data.phone_number)
    mappedData.user.phone_number = user_data.phone_number;

  if (eventData.countryCode) mappedData.user.country = eventData.countryCode;
  else if (eventData.country) mappedData.user.country = eventData.country;
  else if (user_data.country) mappedData.user.country = user_data.country;
  else if (address.country) mappedData.user.country = address.country;

  if (eventData.state) mappedData.user.region = eventData.state;
  else if (eventData.region) mappedData.user.region = eventData.region;
  else if (user_data.region) mappedData.user.region = user_data.region;
  else if (address.region) mappedData.user.region = address.region;

  if (eventData.zip) mappedData.user.postal_code = eventData.zip;
  else if (eventData.postal_code)
    mappedData.user.postal_code = eventData.postal_code;
  else if (user_data.postal_code)
    mappedData.user.postal_code = user_data.postal_code;
  else if (address.postal_code)
    mappedData.user.postal_code = address.postal_code;

  if (eventData.city) mappedData.user.city = eventData.city;
  else if (address.city) mappedData.user.city = address.city;

  if (eventData.company_name)
    mappedData.user.company_name = eventData.company_name;

  if (eventData.job_title) mappedData.user.job_title = eventData.job_title;

  if (eventData.date_of_birth)
    mappedData.user.date_of_birth = eventData.date_of_birth;

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
      'gtm4wp.orderCompletedEEC': 'Purchase',
    };

    if (!gaToEventName[eventName]) {
      return {
        tracking_type: 'Custom',
        custom_event_name: eventName,
      };
    }

    return {
      tracking_type: gaToEventName[eventName],
    };
  }

  return {
    tracking_type: data.eventName,
  };
}

function checkRequiredParams(postBody) {
  let failed = false;
  let error = '';
  let required = [
    'account_id',
    'conversion.event_name',
    'conversion.event_id',
    'conversion.click_id',
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
      TraceId: traceId,
      EventName: eventName,
      Error: 'Missing params: ' + error,
      Body: postBody,
    });
  }
  return failed;
}

function log(logObject) {
  if (isLoggingEnabled) {
    logToConsole(JSON.stringify(logObject));
  }
}

function determinateIsLoggingEnabled() {
  const containerVersion = getContainerVersion();
  const isDebug = !!(
    containerVersion &&
    (containerVersion.debugMode || containerVersion.previewMode)
  );

  if (!data.logType) {
    return isDebug;
  }

  if (data.logType === 'no') {
    return false;
  }

  if (data.logType === 'debug') {
    return isDebug;
  }

  return data.logType === 'always';
}

function enc(data) {
  data = data || '';
  return encodeUriComponent(data);
}
