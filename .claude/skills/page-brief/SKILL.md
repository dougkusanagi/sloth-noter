---
name: page-brief
description: Build the SEO brief for one target keyword. Use when asked to rank for a keyword, optimise a page, or before creating any new page.
---
1. Send ChatSEO (send_message, siteId), word for word:
   "I want to rank first on <keyword>. Read the live top 10. Tell me
   which page type wins, which secondary keywords the top 3 also rank
   for, and whether I should optimise an existing page or create a new
   one. Then give me the full brief."
2. Poll until complete. Extract: create or optimise and which URL,
   primary and secondary keywords, the sections the top 3 all have,
   the title and meta description proposed.
3. If an existing URL already gets clicks or impressions for the
   keyword, STOP any plan to create a new page. We optimise.
4. Check the title contains the primary keyword and fits without
   truncating in a SERP preview.
5. Save the brief to briefs/<keyword-slug>.md. Do not edit the site yet.
