/* Общая схема текстов и настроек — используется сервером (дефолты) и админкой (форма). */
(function (root) {
  'use strict';

  // [ключ, подпись, значение по умолчанию, тип: text | area | list]
  const TEXT_GROUPS = [
    {
      id: 'intro', title: 'Заставка', hint: 'Первый экран — по нажатию включается музыка',
      fields: [
        ['introKicker', 'Надпись сверху', '{name}, это тебе'],
        ['introTitle', 'Заголовок', 'У меня для тебя кое-что есть'],
        ['introHint', 'Подсказка под сердечком', 'нажми, чтобы открыть'],
      ],
    },
    {
      id: 'ask', title: 'Вопрос', hint: 'Главный экран с котиком и убегающей кнопкой',
      fields: [
        ['askKicker', 'Надпись сверху', 'У меня к тебе серьёзный вопрос'],
        ['askTitle1', 'Заголовок (строка 1)', 'Пойдёшь со мной'],
        ['askTitle2', 'Заголовок (строка 2, цветная)', 'на свидание?'],
        ['askText', 'Описание', 'Обещаю вкусный вечер, тёплый свет и ни одной неловкой паузы. Котик, кстати, тоже за.', 'area'],
        ['yesBtn', 'Кнопка «Да»', 'Да'],
        ['noBtn', 'Кнопка «Нет»', 'Нет'],
        ['noBubbles', 'Надписи убегающей кнопки (по одной в строке, число строк = число побегов)', 'Ну не-е-ет\nТочно нет?\nМожет, всё же да?\nПоследний шанс…\nЛадно. Лови меня.', 'list'],
        ['noCaptions', 'Подписи под кнопками при побегах (по одной в строке)', 'Кнопка оказалась пугливой.\nОна правда очень не хочет, чтобы ты её нажала.\nСмотри, как старается убежать.\nКажется, она на моей стороне.\nВсё, она сдалась. Нажми — если сможешь.', 'list'],
        ['noGoneCaption', 'Подпись, когда «Нет» исчезла', 'Ну вот. Кнопки «нет» больше нет.'],
        ['catYes', 'Котик при наведении на «Да»', 'мур ♡'],
        ['perfectTitle', 'Салют, если нажала «Да», ни разу не задев «Нет» — заголовок', 'С первого раза!'],
        ['perfectSub', 'Салют — подпись', 'даже не взглянула на «нет» ♡'],
      ],
    },
    {
      id: 'date', title: 'Выбор дня и времени',
      fields: [
        ['dateKicker', 'Надпись сверху', 'Ты сказала «да» — теперь главное'],
        ['dateTitle1', 'Заголовок (белая часть)', 'Выбери'],
        ['dateTitle2', 'Заголовок (цветная часть)', 'день и час'],
        ['dateText', 'Описание', 'Ближайшая неделя в твоём распоряжении. Я подстроюсь.', 'area'],
        ['dayLabel', 'Подпись «День»', 'День'],
        ['timeLabel', 'Подпись «Время»', 'Время'],
        ['dayPartLabel', 'Подпись «Днём»', 'Днём'],
        ['eveningLabel', 'Подпись «Вечером»', 'Вечером'],
        ['tomorrowLabel', 'Как подписать завтрашний день', 'завтра'],
        ['dateHintStart', 'Рукописная строка до выбора (можно пусто)', ''],
        ['dateHintTime', 'Рукописная строка после выбора дня', 'Отлично. Теперь час.'],
        ['dateHintDay', 'Если выбрано время, но не день', 'Час есть. Осталось выбрать день.'],
        ['dateHintDone', 'Когда всё выбрано ({date}, {time})', 'Значит, {date}, в {time} ♡'],
        ['confirmBtn', 'Кнопка подтверждения', 'Договорились'],
      ],
    },
    {
      id: 'letter', title: 'Письмо',
      fields: [
        ['letterText', 'Текст после отправки', 'Я передам {fromDat}, спасибо ♡'],
        ['letterSub', 'Мелкая подпись', 'письмо уже в пути'],
      ],
    },
    {
      id: 'final', title: 'Финал',
      fields: [
        ['finalKicker', 'Надпись сверху', 'Всё, договорились'],
        ['finalTitle', 'Заголовок (рукописный)', 'До встречи!'],
        ['finalText', 'Текст', 'Буду ждать и немножко волноваться. Надень то, в чём тебе хорошо — остальное я беру на себя.', 'area'],
        ['finalSign', 'Подпись', '— {from}'],
        ['whenPill', 'Дата на плашке ({date}, {time})', '{date}, в {time}'],
        ['calendarBtn', 'Кнопка календаря', 'В календарь'],
        ['calendarTitle', 'Название события в календаре', 'Свидание с {fromIns} ♡'],
        ['replyBtn', 'Кнопка ответа', 'Ответить'],
        ['notePlaceholder', 'Подсказка в поле ответа', 'Например, куда хочется пойти…'],
        ['noteSend', 'Кнопка отправки ответа', 'Отправить'],
        ['noteSent', 'После отправки ответа', 'Доставлено ♡ {from} уже читает'],
      ],
    },
  ];

  const SETTINGS_DEFAULTS = {
    name: 'Солнце',
    fromName: 'Максим',
    fromDative: 'Максиму',
    fromInstr: 'Максимом',
    daysCount: 7,
    dayTimes: '12:00, 13:00, 14:00, 15:00',
    eveningTimes: '17:00, 18:00, 19:00, 20:00, 21:00',
    duration: 2,
    showIntro: true,
    cursor: true,
    theme: 'violet',
    musicMode: 'builtin', // builtin | custom | off
    musicVolume: 0.55,
    musicFile: '',
    tilt: true,
  };

  const THEMES = [
    { id: 'violet', title: 'Лиловая ночь', colors: ['#2b0d44', '#c2347a', '#7b2fd0'] },
    { id: 'rose', title: 'Розовый рассвет', colors: ['#2a0a18', '#ff5c8a', '#b0306b'] },
    { id: 'night', title: 'Звёздная полночь', colors: ['#070b24', '#3a4bd8', '#8a3ad8'] },
    { id: 'peach', title: 'Персиковый закат', colors: ['#2a120c', '#ff8a5c', '#d0407a'] },
  ];

  const LANGS = [
    { id: 'ru', title: 'Русский', short: 'RU', locale: 'ru-RU', sample: 'Пойдёшь со мной на свидание?' },
    { id: 'uk', title: 'Українська', short: 'UA', locale: 'uk-UA', sample: 'Підеш зі мною на побачення?' },
    { id: 'en', title: 'English', short: 'EN', locale: 'en-US', sample: 'Will you go on a date with me?' },
  ];

  // готовые переводы всех надписей (русский — значения по умолчанию из TEXT_GROUPS)
  const TRANSLATIONS = {
    uk: {
      introKicker: '{name}, це тобі',
      introTitle: 'У мене для тебе дещо є',
      introHint: 'натисни, щоб відкрити',
      askKicker: 'У мене до тебе серйозне питання',
      askTitle1: 'Підеш зі мною',
      askTitle2: 'на побачення?',
      askText: 'Обіцяю смачний вечір, тепле світло й жодної незручної паузи. Котик, до речі, теж за.',
      yesBtn: 'Так',
      noBtn: 'Ні',
      noBubbles: 'Ну ні-і-і\nТочно ні?\nМоже, все ж так?\nОстанній шанс…\nГаразд. Лови мене.',
      noCaptions: 'Кнопка виявилася полохливою.\nВона дуже не хоче, щоб ти її натиснула.\nДивись, як старається втекти.\nЗдається, вона на моєму боці.\nУсе, вона здалася. Натисни — якщо зможеш.',
      noGoneCaption: 'Ну от. Кнопки «ні» більше немає.',
      catYes: 'мур ♡',
      perfectTitle: 'З першого разу!',
      perfectSub: 'навіть не глянула на «ні» ♡',
      dateKicker: 'Ти сказала «так» — тепер головне',
      dateTitle1: 'Обери',
      dateTitle2: 'день і час',
      dateText: 'Найближчий тиждень у твоєму розпорядженні. Я підлаштуюся.',
      dayLabel: 'День',
      timeLabel: 'Час',
      dayPartLabel: 'Вдень',
      eveningLabel: 'Увечері',
      tomorrowLabel: 'завтра',
      dateHintStart: '',
      dateHintTime: 'Чудово. Тепер година.',
      dateHintDay: 'Година є. Залишилося обрати день.',
      dateHintDone: 'Отже, {date}, о {time} ♡',
      confirmBtn: 'Домовились',
      letterText: 'Я передам {fromDat}, дякую ♡',
      letterSub: 'лист уже в дорозі',
      finalKicker: 'Усе, домовились',
      finalTitle: 'До зустрічі!',
      finalText: 'Чекатиму й трохи хвилюватимусь. Одягни те, в чому тобі добре — решту я беру на себе.',
      finalSign: '— {from}',
      whenPill: '{date}, о {time}',
      calendarBtn: 'У календар',
      calendarTitle: 'Побачення з {fromIns} ♡',
      replyBtn: 'Відповісти',
      notePlaceholder: 'Наприклад, куди хочеться піти…',
      noteSend: 'Надіслати',
      noteSent: 'Доставлено ♡ {from} вже читає',
    },
    en: {
      introKicker: '{name}, this is for you',
      introTitle: 'I have something for you',
      introHint: 'tap to open',
      askKicker: 'I have a serious question',
      askTitle1: 'Will you go',
      askTitle2: 'on a date with me?',
      askText: 'I promise a delicious evening, warm lights and not a single awkward pause. The kitty is in, by the way.',
      yesBtn: 'Yes',
      noBtn: 'No',
      noBubbles: 'Nooo-o\nAre you sure?\nMaybe yes after all?\nLast chance…\nFine. Catch me.',
      noCaptions: 'The button turned out to be shy.\nIt really doesn’t want you to press it.\nLook how hard it tries to run away.\nI think it’s on my side.\nThat’s it, it gave up. Press it — if you can.',
      noGoneCaption: 'Well. There’s no “no” button anymore.',
      catYes: 'purr ♡',
      perfectTitle: 'First try!',
      perfectSub: 'didn’t even look at “no” ♡',
      dateKicker: 'You said “yes” — now the main part',
      dateTitle1: 'Pick a',
      dateTitle2: 'day and time',
      dateText: 'The whole next week is yours. I’ll adjust.',
      dayLabel: 'Day',
      timeLabel: 'Time',
      dayPartLabel: 'Afternoon',
      eveningLabel: 'Evening',
      tomorrowLabel: 'tmrw',
      dateHintStart: '',
      dateHintTime: 'Perfect. Now the time.',
      dateHintDay: 'Got the time. Now pick a day.',
      dateHintDone: 'So, {date}, at {time} ♡',
      confirmBtn: 'It’s a date',
      letterText: 'I’ll pass it to {from}, thank you ♡',
      letterSub: 'the letter is on its way',
      finalKicker: 'That’s settled',
      finalTitle: 'See you soon!',
      finalText: 'I’ll be waiting and a little nervous. Wear whatever makes you feel good — I’ll take care of the rest.',
      finalSign: '— {from}',
      whenPill: '{date}, at {time}',
      calendarBtn: 'Add to calendar',
      calendarTitle: 'Date with {from} ♡',
      replyBtn: 'Reply',
      notePlaceholder: 'For example, where you’d like to go…',
      noteSend: 'Send',
      noteSent: 'Delivered ♡ {from} is already reading',
    },
  };

  function textDefaults(lang) {
    const out = {};
    for (const g of TEXT_GROUPS) for (const f of g.fields) out[f[0]] = f[2];
    if (lang && TRANSLATIONS[lang]) Object.assign(out, TRANSLATIONS[lang]);
    return out;
  }

  const api = { TEXT_GROUPS, SETTINGS_DEFAULTS, THEMES, LANGS, TRANSLATIONS, textDefaults };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SCHEMA = api;
})(this);
