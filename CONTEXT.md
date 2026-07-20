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

**Post outline**:
An optional navigation aid generated from headings in a **Post**'s public body content.
_Avoid_: Table of contents, contents

**Writing feedback**:
Editor-only spelling, grammar, and style guidance shown while authoring **Post content**. **Writing feedback** is not part of a **Draft version** or **Published version**.
_Avoid_: Grammar error, content validation

**Writing feedback suppression**:
An editor-only preference that hides a grammar or style **Writing feedback** item. A suppression may apply to one **Post** or globally across the CMS, but it is not **Post content** and does not create draft changes.
_Avoid_: Content edit, rule deletion

**Writing feedback dictionary word**:
An editor-only spelling preference that teaches Harper an accepted word. A dictionary word may apply to one **Post** or globally across the CMS, but it is not **Post content** and does not create draft changes.
_Avoid_: Saved word, spelling correction

**Draft version**:
The editable version of a **Post** that is not visible on the public site until it is published.
_Avoid_: Working copy, unpublished changes

**Published version**:
The public version of a **Post** visible on the site. A **Post** may have a **Published version** and a newer **Draft version** at the same time.
_Avoid_: Live copy, current version

**Unpublished changes**:
Saved **Draft version** changes that differ from the **Published version** and are not visible on the public site. **Unpublished changes** are distinct from an **Unpublished Post**.
_Avoid_: Unsaved changes, dirty editor

**Unpublished Post**:
A **Post** that has been published before but is currently hidden from the public site.
_Avoid_: Draft

**Archived Post**:
A **Post** hidden from the public site and from the normal active editing workflow, without deleting its authored content.
_Avoid_: Deleted post

**Slug redirect**:
A public redirect from an old **Post** slug to the current published slug for the same **Post**.
_Avoid_: Alias, rewrite

**Media figure**:
An image, video, or other media embed placed in **Post content**. A **Media figure** may have one caption authored with the post; library captions are reusable defaults, not linked captions.
_Avoid_: Attachment, asset

**Code block**:
A block of source code or structured text placed in **Post content**. A **Code block** has one **Code block language** and may have **Highlighted line ranges**.
_Avoid_: Snippet, preformatted text

**Code block language**:
The supported programming or markup language assigned to a **Code block** for editing and public syntax highlighting.
_Avoid_: Grammar, lexer, mode

**Highlighted line range**:
One or more authored line spans in a **Code block** that should be visually emphasized when the Post is rendered.
_Avoid_: Selection, annotation

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
