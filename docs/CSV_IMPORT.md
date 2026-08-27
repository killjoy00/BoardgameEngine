# BoardGameGeek CSV import contract

The authenticated application accepts the user's collection CSV directly. The original file and private values are never committed to source control. Import processing must show a preview before writing data and should discard the uploaded file after the confirmed import completes.

## Observed header

```text
objectname,objectid,rating,numplays,weight,own,fortrade,want,wanttobuy,wanttoplay,prevowned,preordered,wishlist,wishlistpriority,wishlistcomment,comment,conditiontext,haspartslist,wantpartslist,collid,baverage,average,avgweight,rank,numowned,objecttype,originalname,minplayers,maxplayers,playingtime,maxplaytime,minplaytime,yearpublished,bggrecplayers,bggbestplayers,bggrecagerange,bgglanguagedependence,publisherid,imageid,year,language,other,itemtype,barcode,pricepaid,pp_currency,currvalue,cv_currency,acquisitiondate,acquiredfrom,quantity,privatecomment,invlocation,invdate,version_publishers,version_languages,version_yearpublished,version_nickname
```

## Initial mappings

| CSV field | Application meaning |
|---|---|
| `objectid` | Canonical BGG game ID |
| `collid` | Source collection-row ID used for reconciliation |
| `objectname` / `originalname` | Display and original titles |
| `own`, `fortrade`, `want`, `wishlist`, `wishlistpriority` | Source collection states |
| `quantity` | Number of physical copies represented by the row; blank does not create an owned copy |
| `pricepaid`, `pp_currency` | Known purchase cost and currency; purchase tax and shipping are already included |
| blank `pricepaid` | Unknown cost; create the copy and add it to the missing-cost queue |
| numeric zero `pricepaid` | Explicit known zero cost; do not add it to the missing-cost queue |
| `acquisitiondate`, `acquiredfrom` | Optional acquisition provenance |
| `conditiontext`, `privatecomment`, `invlocation`, `invdate` | Private copy metadata imported for its owner |
| `version_*`, `language`, `year` | Edition metadata |

The importer must parse CSV quoting rather than splitting on commas, validate identifiers and money, preserve unrecognized columns in the preview, and never log row contents containing private comments or prices.

Rows with a blank `quantity` may still carry wishlist or other collection statuses, but do not create a physical owned copy. A zero quantity likewise creates no copy. An invalid quantity blocks that row in import review.
