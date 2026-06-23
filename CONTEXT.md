# Publishing

This context covers authored posts on andrewingram.net and the small CMS used to manage them.

## Language

**Post**:
An authored piece of writing published or drafted for the site. A **Post** has one **Post title** and one **Post content**.
_Avoid_: Article, entry

**Post title**:
The title that names a **Post** for editing, listing, slug generation, and public display.
_Avoid_: Heading, headline

**Post content**:
The structured body of a **Post**, including the title-bearing structure and rich text blocks used for public rendering.
_Avoid_: Document, editor state

**Media figure**:
An image, video, or other media embed placed in **Post content**. A **Media figure** may have one caption authored with the post; library captions are reusable defaults, not linked captions.
_Avoid_: Attachment, asset

**Image asset**:
A reusable uploaded image held by the media library.
_Avoid_: Image file, media figure

**Image rendition**:
A derived representation of an **Image asset** prepared for delivery at a particular size and format.
_Avoid_: Variant, thumbnail

## Example Dialogue

Dev: "When a Post is saved, should the Post title be taken from the edited content?"

Domain expert: "Yes. The Post title is part of the authored Post content, and it also labels the Post in the CMS."

Dev: "Can a Media figure caption be edited as part of the Post?"

Domain expert: "Yes. The caption belongs to the Media figure in this Post content, even when the media came from a library."

Dev: "If the image library caption later changes, should existing Posts update?"

Domain expert: "No. The library caption only seeds the Media figure caption when inserted."

Dev: "If an Image asset is swapped on an existing Media figure, should its caption change?"

Domain expert: "No. The caption belongs to the Media figure and is preserved when its Image asset changes."
