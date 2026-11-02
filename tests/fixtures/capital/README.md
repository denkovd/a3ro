# Official monthly capital fixtures

Verified 2 November 2026. These are selected September 2026 rows/columns from the official exports, not invented observations. They exercise quoted headers, source-specific date formats, instrument selection, negative-yield support, China timestamps and full-month aggregation.

- `rba.csv`: RBA F2.1, `FCMYGBAG10`, https://www.rba.gov.au/statistics/tables/csv/f2.1-data.csv
- `boe.csv`: Bank of England, `IUMAMNPY`, https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Aug/2026&Dateto=now&SeriesCodes=IUMAMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N
- `fed.csv`: Federal Reserve H.15 monthly package, `RIFLGFCY10_N.M`, https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=d7e27b7b09a3a7feae95b9c61781fcd8&lastobs=12&from=&to=&filetype=csv&label=include&layout=seriescolumn&type=package
- `mof.csv`: Japan MOF JGB `10Y`, https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv
- `snb.csv`: SNB current daily cube, `CHF/10J`, https://data.snb.ch/api/cube/rendeiduebd/data/csv/en?dimSel=D0(CHF),D1(10J)&fromDate=2026-09-01&toDate=2026-10-31
- `ecb.csv`: ECB all-issuer nominal 10-year par curve, https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_C.SV_C_YM.PY_10Y?format=csvdata&startPeriod=2026-09-01&endPeriod=2026-10-31
- `chinabond.json`: MOF–ChinaBond 10-year government curve, https://yield.chinabond.com.cn/cbweb-czb-web/czb/czbQueryYz?zblx=yz&gjqx=10&startTime=2026-09-01&endTime=2026-09-30&locale=en_US&qxmc=1
