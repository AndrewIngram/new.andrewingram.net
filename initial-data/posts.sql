INSERT INTO posts (id, title, content, created_at, updated_at)
VALUES (
  '1',
  'First Post',
  '{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This is the first post." }
      ]
    }
  ]
}',
  1704110400000,
  1704110400000
);

INSERT INTO posts (id, title, content, created_at, updated_at)
VALUES (
  '2',
  'Second Post',
  '{
  "type": "doc",
  "content": [
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "This is the second post." }
      ]
    }
  ]
}',
  1706779800000,
  1767128465958
);

INSERT INTO posts (id, title, content, created_at, updated_at)
VALUES (
  '3',
  'Demystifying GraphQL Connections',
  '{
  "type": "doc",
  "content": [
    {
      "type": "title",
      "content": [
        {
          "type": "text",
          "text": "Demystifying GraphQL Connections"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "If you’ve used GraphQL for a while, it’s likely come across its (formally Relay’s) "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "link"
            }
          ],
          "text": "Connection Specification"
        },
        {
          "type": "text",
          "text": " whether you’ve used it or not. It’s a pattern for implementing cursor-based pagination in GraphQL. Relay itself comes with first-class support for working with connections, but the pattern is often used in the wider GraphQL ecosystem — such as with Apollo."
        }
      ]
    },
    {
      "type": "paragraph"
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Over the years I’ve been working with GraphQL, I’ve seen a number of misconceptions pop up time and again. I’ll quickly address each of them before we dive into a deeper explanation of connections."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "Misconception 1: Connections are a pattern unique to GraphQL"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "As will hopefully become clearer by the end of this post, the problems that connections solve are not unique to GraphQL. Assuming performance and coherent data modelling are a concern, you’ll likely face these problems regardless of how you choose to implement your API. What’s different with GraphQL is simply that there’s a prominent first-party specification written by the original authors of the technology, and implemented in its earliest versions."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "Misconception 2: Connections are the only way to implement pagination with GraphQL"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Due to a relatively high degree of prominence within GraphQL’s own documentation, as well as the wider ecosystem, it’s easy to be left with the impression that you have to use connections if you want to implement pagination with GraphQL. Whilst connections are a good pattern and I’d advocate using them if possible, you’re ultimately free to implement pagination in any way you choose."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "Misconception 3: You have to use connections if you’re using Relay"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "A commonly cited reason for "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "not"
        },
        {
          "type": "text",
          "text": " using Relay, is that you have to use connections (along with a number of other patterns). It’s true that Relay originally placed quite a few hard constraints on schema design, but nearly all of these were lifted with its 1.0 release (aka Relay Modern) in 2017. Interestingly, the use of connections was never a requirement — Relay merely provides a number of APIs and optimisations for working with them. That said, I’d argue that most (if not all) of the patterns promoted by Relay should be considered recommendations, regardless of whether you’re using it or not."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "What problems do connections solve?"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "When discussing connections, it’s important to realise that they’re solving two problems:"
        }
      ]
    },
    {
      "type": "orderedList",
      "content": [
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "The need for a coherent and complete data structure that lets us implement pagination for anything in our schema in a common way."
                }
              ]
            }
          ]
        },
        {
          "type": "listItem",
          "content": [
            {
              "type": "paragraph",
              "content": [
                {
                  "type": "text",
                  "text": "The need to implement pagination efficiently"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "The GraphQL Connection Specification solves both of these, by providing a well-considered data structure and promoting the use of cursors rather than the more common limit-offset pagination you might be used to seeing. It’s important to recognise that two problems are being solved, because then it should hopefully become clearer that even if (say) you don’t want to use cursor-based pagination, the overall shape of the connection specification is still worth adhering to."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "One thing that’s important to bear in mind with connections, is that if you think too hard about their overlap with graph terminology, it’ll probably harm your understanding more than it helps. So when we discuss things like edges, nodes and connections, do your best to leave any existing graph knowledge from computer science at the door."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "The structure of a connection"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Let’s say you had an "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "Event"
        },
        {
          "type": "text",
          "text": " type you wanted to paginate over. If you were to use the connection data structure, you’d end up defining an "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "EventConnection"
        },
        {
          "type": "text",
          "text": " type as follows (using the GraphQL SDL):"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "graphql"
        }
      ]
    },
    {
      "type": "codeBlock",
      "content": [
        {
          "type": "text",
          "text": "type PageInfo {\n  startCursor: String!\n  endCursor: String!\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n}\n\ntype EventEdge {\n  node: Event!\n  cursor: String!\n}\n\ntype EventConnection {\n  edges: [EventEdge]\n  pageInfo: PageInfo!\n}\n"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "To use this type, you might do so like this:"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "graphql"
        }
      ]
    },
    {
      "type": "codeBlock",
      "content": [
        {
          "type": "text",
          "text": "type Query {\n  upcomingEvents(\n    first: Int\n    last: Int\n    before: String\n    after: String\n  ): EventConnection\n}\n"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "The arguments to "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "upcomingEvents"
        },
        {
          "type": "text",
          "text": " and the structure of "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "PageInfo"
        },
        {
          "type": "text",
          "text": " itself are specific to cursor-based pagination, but I want to draw closer attention to "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "EventEdge"
        },
        {
          "type": "text",
          "text": ". The edge type is particularly contentious, I’ve often seen it argued that it’s unnecessary."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "The primary reason why people think it’s unnecessary, is that all the information you need to actually perform pagination is on "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "PageInfo"
        },
        {
          "type": "text",
          "text": ", making the additional "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "cursor"
        },
        {
          "type": "text",
          "text": " field serve no purpose. And if the cursor field isn’t needed, can’t we omit the entire edge and just jump straight to the nodes?"
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "Defending edges"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Earlier I mentioned that connections solve two problems, and I have two equivalent defences of the inclusion of edges in the specification."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "The role of cursors on edges"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "I’ll start with the justifications specific to cursor-based pagination. These are all about unlocking potential performance optimisations. I say "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "potential"
        },
        {
          "type": "text",
          "text": " because as far as I’m aware there’s currently no automatic behaviour in Relay (or anything else) that takes advantage of per-edge cursors, so the fact that they’re "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "required"
        },
        {
          "type": "text",
          "text": " by Relay might be considered a legacy wart. One simple use case is related to mutations. Should a mutation cause a previously fetched connection to change sufficiently for its "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "pageInfo"
        },
        {
          "type": "text",
          "text": " to no longer be valid (perhaps you deleted the last edge or otherwise moved it), having a cursor on every edge will allow you to synthesise an updated version of it without having to refetch, thereby fixing the state of the pagination data in the store and letting you continue to load more results."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "A slightly more complicated involved use case for per-edge cursors is related to the fact that you could request connections with different page sizes. Let’s say for a given connection you’ve already queried the first 10 results, then elsewhere in UI you choose to query the same connection but this time you only want the first 5. In terms of the data you likely care about (the nodes), you don’t actually need to fire off a query because you already have all the data you need. The problem is the "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "pageInfo"
        },
        {
          "type": "text",
          "text": " you’ll have for the component rendering 10 results won’t be correct for the one rendering 5. But as with the mutation use case, if we have per-edge cursors, we have all the necessary information to synthesise a correct "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "pageInfo"
        },
        {
          "type": "text",
          "text": " without actually having to execute a query."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "At this point I should clarify why we need the edge type at all, and absolutely shouldn’t be considering putting the cursor on the node itself. In my earlier example I had an "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "Event"
        },
        {
          "type": "text",
          "text": " type which you’d expect to have an "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "id"
        },
        {
          "type": "text",
          "text": " field on it. With GraphQL, it’s all but standardised that for a given query, anything with an "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "id"
        },
        {
          "type": "text",
          "text": " should look the same no matter how many times it appears or how it’s accessed (allowing for different field selections) — GraphQL clients such as Relay and Apollo depend on this rule to work correctly. So when you need to add transient contextual information to something, the correct pattern is to use a wrapper. In the case of connections, the wrapper is the edge type."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "Other uses for edges"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "So we’ve established that there’s "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "some"
        },
        {
          "type": "text",
          "text": " value in having a cursor on each edge type. But what if you’re not using cursor-based pagination, or don’t care for those optimisations, do we still need an edge wrapping each node?"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Imagine you’re building a mobile app that shows you places around a location. You have a UI that shows you some information about the place, and its distance from you, probably showing the closest first. You choose to model it as follows:"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "graphql"
        }
      ]
    },
    {
      "type": "codeBlock",
      "content": [
        {
          "type": "text",
          "text": "type LatLng {\n  longitude: Float!\n  latitude: Float!\n}\n\ninput LatLngInput {\n  longitude: Float!\n  latitude: Float!\n}\n\ntype Place {\n  id: ID!\n  name: String!\n  location: LatLng!\n  distance: Float!\n}\n\ntype PageInfo {\n  startCursor: String!\n  endCursor: String!\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n}\n\ntype PlaceEdge {\n  node: Place!\n  cursor: String!\n}\n\ntype PlaceConnection {\n  edges: [PlaceEdge]\n  pageInfo: PageInfo!\n}\n\ntype Query {\n  placesAroundLocation(\n    location: LatLngInput!\n    first: Int\n    last: Int\n    before: String\n    after: String\n  ): PlaceConnection\n}\n"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "Perhaps you can already see the problem, if the user were to issue a query with different locations, the distances on each place should change — but this violates the aforementioned common caching assumption that a type with an ID is the same no matter how you get to it. If it’s possible to have the same place but with different values for its fields, something has gone wrong in our modelling."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "So we change our modelling a bit:"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "graphql"
        }
      ]
    },
    {
      "type": "codeBlock",
      "content": [
        {
          "type": "text",
          "text": "type LatLng {\n  longitude: Float!\n  latitude: Float!\n}\n\ninput LatLngInput {\n  longitude: Float!\n  latitude: Float!\n}\n\ntype Place {\n  id: ID!\n  name: String!\n  location: LatLng!\n}\n\ntype PageInfo {\n  startCursor: String!\n  endCursor: String!\n  hasNextPage: Boolean!\n  hasPreviousPage: Boolean!\n}\n\ntype PlaceDistanceEdge {\n  node: Place!\n  cursor: String!\n  distance: Float!\n}\n\ntype PlaceDistanceConnection {\n  edges: [PlaceDistanceEdge]\n  pageInfo: PageInfo!\n}\n\ntype Query {\n  placesAroundLocation(\n    location: LatLngInput!\n    first: Int\n    last: Int\n    before: String\n    after: String\n  ): PlaceDistanceConnection\n}\n"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "We’ve made a few changes here. The most important is that the "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "distance"
        },
        {
          "type": "text",
          "text": " field has been moved out of the "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "Place"
        },
        {
          "type": "text",
          "text": " type and onto the connection edge. This is because it represents transient metadata about the node that’s only true for the current connection. This change also highlights that our connection and edge types aren’t universally re-usable, if we were to allow place connections where there’s no use for distance, we’d want to use different connection and edge types. As a consequence, I’ve renamed the connection types to highlight that they’re specific to this use case."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "Note: there’s nothing stopping you having generic connection types with lots of nullable fields, but my preference is for more explicit modelling to lock down the possible shapes of data in client code"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "A similar use case might be a search feature where you want to display the relevance of each result to the search query, this information belongs on the edge because it’s contextual to the connection."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "But do we always need edges?"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "So there are some valid use cases for edge types, be it for Relay’s cursors, or something more specific to your needs, but if none of these apply, do we still need edges on our connections?"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "The simple answer is no, but you might still choose to implement them. The reason is that we get some benefit from having common patterns. Even if most pagination use cases have no need for edges, the fact that "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "some"
        },
        {
          "type": "text",
          "text": " do means that it’s arguably advantageous to use them anyway, to add a degree of consistency (and to open up potential abstractions) in client code."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "One compromise I’ve seen is allowing direct traversal from the connection to the nodes (skipping the edge type) for simpler scenarios, whilst retaining the edge type for when they’re genuinely needed, so the modelling looks like this:"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "graphql"
        }
      ]
    },
    {
      "type": "codeBlock",
      "content": [
        {
          "type": "text",
          "text": "type EventConnection {\n  edges: [EventEdge]\n  nodes: [Event]\n  pageInfo: PageInfo!\n}\n"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "I think this is a good pattern, I’ve yet to implement it myself but would advocate for it as a quality-of-life convenience."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "Limit-offset pagination"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "I said at the start that most of the connection structure would be the same even if we weren’t using cursor-based pagination. Now that I’ve justified the inclusion of edge types, it’s possible to show how similarly we’d model what is arguably the most common kind of pagination in use today."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "graphql"
        }
      ]
    },
    {
      "type": "codeBlock",
      "content": [
        {
          "type": "text",
          "text": "type LimitOffsetPageInfo {\n  totalCount: Int!\n}\n\ntype EventEdge {\n  node: Event!\n  cursor: String!\n}\n\ntype EventLimitOffsetConnection {\n  edges: [EventEdge]\n  pageInfo: LimitOffsetPageInfo!\n}\n\ntype Query {\n  upcomingEvents(limit: Int!, offset: Int = 0): EventLimitOffsetConnection\n}\n"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "You may notice the equivalent "
        },
        {
          "type": "text",
          "marks": [
            {
              "type": "code"
            }
          ],
          "text": "PageInfo"
        },
        {
          "type": "text",
          "text": " type is quite sparse. You don’t actually need much information to construct the UI for this kind of pagination, but you may choose to add in additional data to simplify the work of building client UI — it really is up to you."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "italic"
            }
          ],
          "text": "It’s worth noting that implementing cursor-based pagination rather than limit/offset is a decision that should be made mindfully. It’s true that it’s usually (perhaps always?) impossible to implement limit/offset efficiently because of the way that database queries get executed, but opting for cursor-based pagination ties your hands in terms of the kind of user interfaces you can build. There’s no magic bullet, and as with all technical decisions, you want to understand the choices you’re making."
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "I’ve seen some suggestion of a pattern where you combine both pagination schemes into a single data structure and allow the client to choose which arguments and fields to use. I can see the appeal, and definitely think there’s a benefit to providing more choice if your backend can support it. My preference here would be to implement them as two independent parallel patterns rather than a combined one, if only because it communicates intent more clearly to consumers of the API."
        }
      ]
    },
    {
      "type": "heading",
      "content": [
        {
          "type": "text",
          "marks": [
            {
              "type": "bold"
            }
          ],
          "text": "In closing"
        }
      ]
    },
    {
      "type": "paragraph",
      "content": [
        {
          "type": "text",
          "text": "So there we have it, hopefully it’s now a little clearer why the connection specification exists and what problems you can solve by adopting it. Perhaps you’ve also gained some additional insight as to where you can chop and change parts of it to suit your own individual requirements. Either way, thank you for reading!"
        }
      ]
    },
    {
      "type": "paragraph"
    }
  ]
}',
  1710085500000,
  1767314706745
);

INSERT INTO posts (id, title, content, created_at, updated_at)
VALUES (
  '7be2fdc8-4f41-438f-9465-9deb0e65a05e',
  '',
  '{
  "type": "doc",
  "content": [
    {
      "type": "title"
    }
  ]
}',
  1767194302433,
  1767199231864
);
