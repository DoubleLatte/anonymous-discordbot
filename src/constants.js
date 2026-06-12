const CATEGORIES = [
  { label: '불편사항', value: '불편사항' },
  { label: '건의사항', value: '건의사항' },
  { label: '긴급', value: '긴급' },
  { label: '기타', value: '기타' }
];

const PRIORITIES = {
  high: { label: '긴급', icon: '🔴' },
  normal: { label: '보통', icon: '🟡' },
  low: { label: '낮음', icon: '🟢' }
};

const STATUSES = {
  received: '접수됨',
  in_progress: '처리중',
  pending: '보류',
  completed: '완료'
};

module.exports = { CATEGORIES, PRIORITIES, STATUSES };
