'use strict';

function paginationDuplicateCard(titleGroups, descriptionGroups) {
  const card = el('div', 'card');
  card.appendChild(el('div', 'card-header', 'Pagination metadata patterns'));
  const toolbar = el('div', 'toolbar');
  const titles = Array.isArray(titleGroups) ? titleGroups : [];
  const descriptions = Array.isArray(descriptionGroups) ? descriptionGroups : [];
  toolbar.appendChild(badge(`${titles.length} repeated title groups`, titles.length ? 'warning' : 'ok'));
  toolbar.appendChild(badge(`${descriptions.length} repeated description groups`, descriptions.length ? 'warning' : 'ok'));
  card.appendChild(toolbar);
  if (!titles.length && !descriptions.length) {
    card.appendChild(el('div', 'muted', 'No repeated title/description values were found between distinct URLs in the same pagination family.'));
    return card;
  }
  titles.slice(0, 5).forEach((group) => addRow(card, `Title · ${group.value || '(empty)'}`, `${group.count} pagination URLs`, 'code'));
  descriptions.slice(0, 5).forEach((group) => addRow(card, `Description · ${group.value || '(empty)'}`, `${group.count} pagination URLs`, 'code'));
  if (titles.length > 5 || descriptions.length > 5) card.appendChild(el('div', 'muted', 'Showing the first 5 pagination duplicate groups per metadata field. Full groups remain available in JSON export.'));
  return card;
}

const multiTabDuplicateDataBase = multiTabDuplicateData;
multiTabDuplicateData = function multiTabDuplicateDataWithPagination(rows) {
  const base = multiTabDuplicateDataBase(rows);
  const pagination = PaginationAudit.annotateRows(base.rows);
  return Object.assign({}, base, {
    rows: pagination.rows,
    paginationTitles: pagination.titles,
    paginationDescriptions: pagination.descriptions,
  });
};

multiTabFinalizeDuplicates = function multiTabFinalizeDuplicatesWithPagination() {
  const data = multiTabDuplicateData(multiTabState.rows);
  multiTabState.rows = data.rows;
  multiTabState.duplicates = {
    titles: data.titles,
    descriptions: data.descriptions,
    h1: data.h1,
    paginationTitles: data.paginationTitles,
    paginationDescriptions: data.paginationDescriptions,
  };
};

const multiTabSummaryCardBase = multiTabSummaryCard;
multiTabSummaryCard = function multiTabSummaryCardWithPagination(panel) {
  multiTabSummaryCardBase(panel);
  panel.appendChild(paginationDuplicateCard(
    multiTabState.duplicates && multiTabState.duplicates.paginationTitles,
    multiTabState.duplicates && multiTabState.duplicates.paginationDescriptions,
  ));
};

const crawlerUpdateDuplicatesBase = crawlerUpdateDuplicates;
crawlerUpdateDuplicates = function crawlerUpdateDuplicatesWithPagination() {
  crawlerUpdateDuplicatesBase();
  const pagination = PaginationAudit.annotateRows(crawlerState.rows);
  crawlerState.rows = pagination.rows;
  crawlerState.duplicates = Object.assign({}, crawlerState.duplicates, {
    paginationTitles: pagination.titles,
    paginationDescriptions: pagination.descriptions,
  });
};

const crawlerSummaryBase = crawlerSummary;
crawlerSummary = function crawlerSummaryWithPagination(panel) {
  crawlerSummaryBase(panel);
  panel.appendChild(paginationDuplicateCard(
    crawlerState.duplicates && crawlerState.duplicates.paginationTitles,
    crawlerState.duplicates && crawlerState.duplicates.paginationDescriptions,
  ));
};
